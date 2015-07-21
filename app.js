'use strict';

const config = require('./config'),
    path = require('path'),
    _ = require('lodash'),
    http = require('http'),
    d3 = require('d3'),
    async = require('async'),
    express = require('express'),
    compression = require('compression'),
    favicon = require('serve-favicon'),
    NodeCache = require('node-cache'),
    request = require('request').defaults({gzip: true, qs: {api_key: config.key}, headers: {'User-Agent': config.userAgent}});

const REGIONS = ['na', 'br', 'eune', 'euw', 'kr', 'lan', 'las', 'oce', 'ru', 'tr'];
const SORTED_REGIONS = REGIONS.slice().sort();

const API_GET_ID = '/v1.4/summoner/by-name/';
const API_GET_MATCHES = '/v2.2/matchhistory/';

function buildError(msg, code) {
    var error = new Error(msg);
    error.code = code;
    return error;
}

function buildErrorJSONString(err) {
    return JSON.stringify({error: {message: err.message, code: err.code}});
}

/** memoizes function(arg1, arg2, callback) */
function buildCache(ttl, func) {
    var cache = new NodeCache({stdTTL: ttl, checkperiod: config.checkPeriod, useClones: false});
    return function(arg1, arg2, callback) {
        var key = arg1 + ':' + arg2;
        var obj = cache.get(key);
        if (obj === undefined) {
            func(arg1, arg2, function(err, result) {
                if (!err) {
                    if (cache.getStats().keys > config.maxCache) {
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
    request(`https://${region}.api.pvp.net/api/lol/${region}${api}`, function(err, res, body) {
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
        } else if (res.statusCode === 429 || res.statusCode == 503 || res.statusCode == 504) {
            if (tries <= 1) {
                callback(buildError(http.STATUS_CODES[res.statusCode], res.statusCode));
            } else {
                setTimeout(getRiotApi, 2000, region, api, callback, tries - 1);
            }
        } else {
            callback(buildError(http.STATUS_CODES[res.statusCode], res.statusCode));
        }
    });
}

const getSummonerInfo = buildCache(30 * 60, function(region, name, callback) {
    getRiotApi(region, API_GET_ID + encodeURIComponent(name), function(err, result) {
        if (err) callback(err);
        else callback(null, result[name]);
    });
});

const matchCache = new NodeCache({stdTTL: 10 * 60, checkperiod: config.checkPeriod});
function getMatchesById(region, id, out, callback) {
    var cacheKey = region + ':' + id;
    var cached = matchCache.get(cacheKey);
    if (cached !== undefined) {
        callback(null, cached);
        return;
    }
    cached = '';
    const now = new Date();
    const nowDay = d3.time.day(now);
    const backDay = config.days < 0 ? null : d3.time.day.offset(nowDay, -config.days);
    var beginIndex = 0;
    var done = false;
    var firstMatch = true;
    // go thru matches in reverse chronological order
    async.doUntil(function(callback) {
        getRiotApi(region, API_GET_MATCHES + id + `?beginIndex=${beginIndex}&endIndex=${beginIndex + 15}`, function(err, result) {
            if (err) callback(err);
            else {
                result = result.matches || [];
                done = result.length === 0;
                if (!done) {
                    // note: reverse mutates result, but that doesn't matter here
                    result = _(result).reverse().takeWhile(function(match) {
                        if (!backDay) return true;
                        done = done || match.matchCreation < +backDay;
                        return !done;
                    }).map(function(match) {
                        return {
                            matchId: match.matchId,
                            matchCreation: match.matchCreation,
                            matchDuration: match.matchDuration,
                            winner: match.participants[0].stats.winner,
                        };
                    }).value();
                    if (result.length > 0) {
                        var prefix, chunk;
                        if (firstMatch) {
                            firstMatch = false;
                            prefix = '{"days":' + JSON.stringify(config.days) + ',"matches":[';
                        } else {
                            prefix = ',';
                        }
                        chunk = prefix + JSON.stringify(result).slice(1, -1);
                        out.write(chunk);
                        cached += chunk;
                    }
                    beginIndex += 15;
                }
                callback(null);
            }
        });
    }, function() { return done; }, function(err) {
        if (err) {
            if (firstMatch) {
                callback(buildError(err.message, 500));
            } else {
                out.end('],' + buildErrorJSONString(buildError(err.message, 500)).slice(1, -1) + '}');
                callback(null);
            }
        }
        else {
            out.end(']}');
            if (matchCache.getStats().keys > config.maxCache) {
                matchCache.flushAll();
            }
            matchCache.set(cacheKey, cached + ']}');
            callback(null);
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

app.get('/matches', function(req, res) {
    res.set('Content-Type', 'application/json');
    var region = req.query.region;
    async.waterfall([
        getSummonerInfo.bind(null, region, getStandardName(req.query.summoner)),
        function(info, callback) {
            getMatchesById(region, info.id, res, callback);
        },
    ], function(err, result) {
        if (err) res.send(buildErrorJSONString(err));
        else if (result) {
            res.send(result);
        }
    });
});

app.listen(config.port, function() {
    console.log((production ? '' : '\x07') + 'server listening on port ' + config.port);
});
