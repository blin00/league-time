'use strict';

const config = require('./config'),
    path = require('path'),
    _ = require('lodash'),
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
const API_GET_MATCHES = '/v2.2/matchhistory/';

const memcache = memjs.Client.create(config.memcachedServer, {username: config.memcachedUser, password: config.memcachedPass, expires: 30 * 60});

function getCachePromise(key) {
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

// assumes never called on first time with tries !== undefined
function getRiotApi(region, api, callback, tries) {
    if (tries === undefined) {
        if (!validateRegion(region)) {
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
                if (res.statusCode == 429) {
                    console.log('warning: throttled by HTTP 429');
                }
                setTimeout(getRiotApi, 2000, region, api, callback, tries - 1);
            }
        } else {
            callback(buildError(http.STATUS_CODES[res.statusCode], res.statusCode));
        }
    });
}

function getRiotApiPromise(region, api, tries) {
    var timeout = 2000;
    tries = tries || 5;
    return new Promise(function(resolve, reject) {
        if (!validateRegion(region)) {
            reject(buildError('invalid region', 400));
        } else {
            doRequest();
        }
        function doRequest() {
            request(`https://${region}.api.pvp.net/api/lol/${region}${api}`, function(err, res, body) {
                if (err) {
                    err.code = 500;
                    reject(err);
                } else if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(body);
                } else if (res.statusCode === 429 || res.statusCode === 503 || res.statusCode === 504) {
                    if (tries <= 1) {
                        reject(buildError(http.STATUS_CODES[res.statusCode], res.statusCode));
                    } else {
                        if (res.statusCode == 429) {
                            console.log('warning: throttled by HTTP 429');
                        }
                        tries--;
                        setTimeout(doRequest, timeout);
                        timeout += 500;
                    }
                } else {
                    reject(buildError(http.STATUS_CODES[res.statusCode], res.statusCode));
                }
            });
        }
    }).then(JSON.parse);
}

function getSummonerIdPromise(region, name) {
    var cacheKey = region + ':' + name;
    return getCachePromise(cacheKey).catch(function(err) {
        return getRiotApiPromise(region, API_GET_ID + encodeURIComponent(name)).then(function(result) {
            var id = result[name].id.toString();
            memcache.set(cacheKey, id);
            return id;
        });
    });
}

function getMatchesById(region, id, out, callback) {
    var cacheKey = region + '!' + id;
    memcache.get(cacheKey, function(err, value, key) {
        if (!err && value) callback(null, value.toString());
        else {
            var toCache = '';
            const now = new Date();
            const nowDay = d3.time.day(now);
            const backDay = config.days < 0 ? null : d3.time.day.offset(nowDay, -config.days);
            var beginIndex = 0;
            var done = false;
            var firstMatch = true;
            // go thru matches in reverse chronological order
            async.doUntil(function(callback) {
                getRiotApiPromise(region, API_GET_MATCHES + id + `?beginIndex=${beginIndex}&endIndex=${beginIndex + 15}`).then(function(result) {
                    result = result.matches || [];
                    done = result.length === 0;
                    if (!done) {
                        // note: reverse mutates result, but that doesn't matter here
                        result = _(result).takeRightWhile(function(match) {
                            if (!backDay) return true;
                            done = done || match.matchCreation < +backDay;
                            return !done;
                        }).reverse().map(function(match) {
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
                            toCache += chunk;
                            out.write(chunk);
                            out.flush();
                        }
                        beginIndex += 15;
                    }
                    callback(null);
                }).catch(function(err) {
                    callback(err);
                });
            }, function() { return done; }, function(err) {
                if (err) {
                    if (firstMatch) {
                        callback(buildError(err.message, 500));
                    } else {
                        out.end('],' + buildErrorJSONString(buildError(err.message, 500)).slice(1, -1) + '}');
                        callback(null);
                    }
                } else {
                    out.end(']}');
                    memcache.set(cacheKey, toCache + ']}');
                    callback(null);
                }
            });
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
    if (!validateRegion(region)) {
        res.send(buildErrorJSONString(buildError('invalid region', 400)));
        return;
    }
    getSummonerIdPromise(region, summoner).then(function(id) {
        getMatchesById(region, id, res, function(err, result) {
            if (err) res.send(buildErrorJSONString(err));
            else if (result) {
                res.send(result);
            }
        });
    }).catch(function(err) {
        res.send(buildErrorJSONString(err));
    });
});

app.listen(config.port, function() {
    console.log((production ? '' : '\x07') + 'server listening on port ' + config.port);
});
