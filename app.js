'use strict';

const config = require('./config'),
    path = require('path'),
    _ = require('lodash'),
    async = require('async'),
    express = require('express'),
    compression = require('compression'),
    favicon = require('serve-favicon'),
    NodeCache = require('node-cache'),
    request = require('request').defaults({headers: {'User-Agent': config.userAgent}});

const REGIONS = ['na', 'br', 'eune', 'euw', 'kr', 'lan', 'las', 'oce', 'ru', 'tr'];
const SORTED_REGIONS = REGIONS.slice().sort();

const API_GET_ID = '/v1.4/summoner/by-name/';
const API_GET_MATCHES = '/v2.2/matchhistory/';

function buildError(msg, code) {
    var error = new Error(msg);
    error.code = code;
    return error;
}

/** memoizes function(arg1, arg2, callback) */
function buildCache(ttl, func) {
    var cache = new NodeCache({stdTTL: ttl, checkperiod: 60, useClones: false});
    return function(arg1, arg2, callback) {
        var key = arg1 + ':' + arg2;
        var obj = cache.get(key);
        if (obj === undefined) {
            func(arg1, arg2, function(err, result) {
                if (!err) {
                    if (cache.getStats().keys > 100000) {
                        cache.flushAll();
                    }
                    cache.set(key, result);
                }
                callback(err, result);
            });
        } else callback(null, obj);
    };
}

// assumes never called on first time with tries !== undefined
function getRiotApi(region, api, callback, tries) {
    if (tries === undefined) {
        if (_.indexOf(SORTED_REGIONS, region, true) < 0) {
            callback(buildError('invalid region', 400));
            return;
        }
        tries = 5;
    }
    request(`https://${region}.api.pvp.net/api/lol/${region}${api}&api_key=${config.key}`, function(err, res, body) {
        if (err) callback(err);
        else if (res.statusCode >= 200 && res.statusCode < 300) {
            var result;
            try {
                result = JSON.parse(body);
            } catch (e) {
                callback(buildError('JSON parse error: ' + e.message, 500));
                return;
            }
            callback(null, result);
        } else if (res.statusCode === 429) {
            if (tries <= 1) {
                callback(buildError('too many attempts', 429));
            } else {
                setTimeout(getRiotApi, 5000, region, api, callback, tries - 1);
            }
        } else {
            callback(buildError('HTTP ' + res.statusCode, res.statusCode));
        }
    });
}

const getSummonerInfo = buildCache(600, function(region, name, callback) {
    getRiotApi(region, API_GET_ID + encodeURIComponent(name) + '?', function(err, result) {
        if (err) callback(err);
        else callback(null, result[name]);
    });
});

function getMatchesById(region, id, out, callback) {
    const now = Date.now();
    var beginIndex = 0;
    var done = false;
    var firstMatch = true;
    // go thru matches in reverse chronological order
    out.write('{"days":' + JSON.stringify(config.days) + ',"matches":[');
    async.doUntil(function(callback) {
        getRiotApi(region, API_GET_MATCHES + id + `?beginIndex=${beginIndex}&endIndex=${beginIndex + 15}`, function(err, result) {
            if (err) callback(err);
            else {
                result = result.matches || [];
                done = result.length === 0;
                if (!done) {
                    result = _(result).reverse().takeWhile(function(match) {
                        if (config.days < 0) return true;
                        done = done || now - match.matchCreation > config.days * 24 * 60 * 60 * 1000;
                        return !done;
                    }).value();
                    /*
                    time += result[i].matchDuration;
                    wins += result[i].participants[0].stats.winner ? 1 : 0;
                    */
                    if (result.length > 0) {
                        out.write((firstMatch ? '' : ',') + JSON.stringify(result).slice(1, -1));
                        firstMatch = false;
                    }
                    beginIndex += 15;
                }
                callback(null);
            }
        });
    }, function() { return done; }, function(err) {
        if (err) callback(buildError(err.message, 500));
        else {
            out.end(']}');
            callback();
        }
    });
}

function getStandardName(name) {
    if (typeof name !== 'string') {
        return null;
    }
    return name.toLocaleLowerCase().replace(/\s/g, '');
}

const app = express();
app.set('view engine', 'jade');
app.set('views', path.join(__dirname, 'src'));
app.use(compression());
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(express.static(path.join(__dirname, 'public')));

const production = app.get('env') === 'production';

app.get('/', function(req, res) {
    res.render('index', {regions: REGIONS, production: production});
});

app.get('/info', function(req, res) {
    res.set('Content-Type', 'application/json');
    var region = req.query.region;
    async.waterfall([
        getSummonerInfo.bind(null, region, getStandardName(req.query.summoner)),
        function(info, callback) {
            getMatchesById(region, info.id, res, callback);
        },
    ], function(err, result) {
        if (err) res.send(JSON.stringify({error: {message: err.message, code: err.code}}));
        /*else {
            res.send(JSON.stringify({time: result.time, matches: result.numMatches, wins: result.wins, days: config.days}));
        }*/
    });
});

app.listen(config.port, function() {
    console.log((production ? '' : '\x07') + 'server listening on port ' + config.port);
});
