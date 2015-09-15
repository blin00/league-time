'use strict';

const config = require('./config'),
    path = require('path'),
    _ = require('lodash'),
    bluebird = require('bluebird'),
    http = require('http'),
    d3 = require('d3'),
    memjs = require('memjs'),
    async = require('async'),
    express = require('express'),
    compression = require('compression'),
    favicon = require('serve-favicon'),
    request = require('request').defaults({gzip: true, qs: {api_key: config.riotKey}, headers: {'User-Agent': config.userAgent}});

const REGIONS = ['na', 'br', 'eune', 'euw', 'kr', 'lan', 'las', 'oce', 'ru', 'tr'];
const SORTED_REGIONS = REGIONS.slice().sort();
const MAX_REGION_LENGTH = _(REGIONS).map(function(d) { return d.length; }).max();

const API_GET_ID = '/v1.4/summoner/by-name/';
const API_GET_MATCH = '/v2.2/match/';
const API_GET_MATCHLIST = '/v2.2/matchlist/by-summoner/';

const memcache = memjs.Client.create(config.memcachedServer, {username: config.memcachedUser, password: config.memcachedPass});

function getCache(key) {
    return new Promise(function(resolve, reject) {
        memcache.get(key, function(err, value/*, key*/) {
            if (!err && value) resolve(value.toString());
            else reject(err);
        });
    });
}

function validateRegion(region) {
    if (typeof region !== 'string' || region.length > MAX_REGION_LENGTH || _.indexOf(SORTED_REGIONS, region, true) < 0) {
        return false;
    }
    return true;
}

function buildError(msg, code) {
    var error = new Error(msg);
    error.code = code;
    return error;
}

function buildErrorJSONString(err) {
    return JSON.stringify({error: {message: err.message, code: err.code}});
}

function getRiotApi(region, api, tries) {
    tries = tries || 5;
    return new Promise(function(resolve, reject) {
        if (!validateRegion(region)) {
            reject(buildError('invalid region', 400));
        } else {
            doRequest();
        }
        function doRequest() {
            // console.log(`doRequest('https://${region}.api.pvp.net/api/lol/${region}${api}')`);
            request(`https://${region}.api.pvp.net/api/lol/${region}${api}`, function(err, res, body) {
                if (err) {
                    err.code = 500;
                    reject(err);
                } else if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(body);
                } else if (res.statusCode === 429/* || res.statusCode === 503 || res.statusCode === 504*/) {
                    var timeout = res.headers['retry-after'];
                    if (timeout) timeout = (+timeout) * 1000 + 500;
                    else timeout = 2000;
                    console.log('warning: throttled by HTTP 429 - waiting ' + timeout + ' ms');
                    if (tries <= 1) {
                        reject(buildError(http.STATUS_CODES[res.statusCode], res.statusCode));
                    } else {
                        tries--;
                        setTimeout(doRequest, timeout);
                    }
                } else {
                    reject(buildError(http.STATUS_CODES[res.statusCode], res.statusCode));
                }
            });
        }
    }).then(JSON.parse);
}

function getSummonerId(region, name) {
    var cacheKey = region + ':' + name;
    return getCache(cacheKey).catch(function(err) {
        return getRiotApi(region, API_GET_ID + encodeURIComponent(name)).then(function(result) {
            var id = result[name].id.toString();
            memcache.set(cacheKey, id, null, 60 * 60);
            return id;
        });
    });
}

function getMatchListById(region, id, out) {
    var cacheKey = region + '!' + id;
    var cached;
    var first = true;
    const nowDay = d3.time.day(new Date());
    const backDay = config.days < 0 ? 0 : +d3.time.day.offset(nowDay, -config.days);
    return Promise.all([
        getCache(cacheKey).then(JSON.parse).catch(function(err) { return []; }),
        getRiotApi(region, API_GET_MATCHLIST + id + `?beginTime=${backDay}`),
    ]).then(function(values) {
        cached = values[0];
        var matchList = values[1].matches;

        cached = _.takeWhile(cached, function(match) {
            return match.matchCreation >= backDay;
        });

        var firstId = cached.length === 0 ? null : cached[0].matchId;

        var matchIds = _(matchList).takeWhile(function(match) {
            return match.matchId !== firstId;
        }).pluck('matchId').value();
        if (matchIds.length === 0) return [];

        return bluebird.promisify(async.mapSeries)(matchIds, function(matchId, callback) {
            getRiotApi(region, API_GET_MATCH + matchId).then(function(match) {
                var prefix = first ? '{"matches":[' : ',';
                first = false;
                match = {
                    matchId: match.matchId,
                    matchCreation: match.matchCreation,
                    matchDuration: match.matchDuration,
                    winner: match.participants[0].stats.winner,
                };
                out.write(prefix + JSON.stringify(match));
                out.flush();
                callback(null, match);
            }).catch(function(err) {
                callback(err);
            });
        });
    }).then(function(matches) {
        if (matches.length === 0) {
            return cached;
        } else {
            out.end(']}');
            matches = matches.concat(cached);
            memcache.set(cacheKey, JSON.stringify(matches));
            return null;
        }
    }).catch(function(err) {
        if (first) throw err;
        else {
            out.end('],' + buildErrorJSONString(err).slice(1));
            return null;
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
const production = app.get('env') === 'production';

app.set('view engine', 'jade');
app.locals.pretty = !production;
app.set('views', path.join(__dirname, 'src'));
app.set('x-powered-by', false);
app.use(compression());
app.use(favicon(path.join(__dirname, 'favicon.ico')));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', function(req, res) {
    res.render('index', {regions: REGIONS, production: production});
});

app.get('/matches', function(req, res) {
    res.set('Content-Type', 'application/json');
    var region = req.query.region;
    var summoner = req.query.summoner;
    getSummonerId(region, summoner).then(function(id) {
        return getMatchListById(region, id, res);
    }).then(function(result) {
        if (result !== null) res.send({matches: result});
    }).catch(function(err) {
        res.send(buildErrorJSONString(err));
    });
});

app.listen(config.port, function() {
    console.log((production ? '' : '\x07') + 'server listening on port ' + config.port);
});
