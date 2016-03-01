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
const MAX_REGION_LENGTH = _(REGIONS).maxBy(function(d) { return d.length; });

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
    if (typeof region !== 'string' || region.length > MAX_REGION_LENGTH || _.keyBy(SORTED_REGIONS, region, true) < 0) {
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
    tries = tries || 3;
    return new Promise(function(resolve, reject) {
        function doRequest() {
            // console.log(`doRequest('https://${region}.api.pvp.net/api/lol/${region}${api}')`);
            request(`https://${region}.api.pvp.net/api/lol/${region}${api}`, function(err, res, body) {
                if (err) {
                    err.code = 500;
                    reject(err);
                } else if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(body);
                } else if (res.statusCode !== 404 && res.statusCode !== 422) {
                    var timeout = res.headers['retry-after'];
                    if (timeout) timeout = (+timeout) * 1000 + 500;
                    else timeout = 1000;
                    if (tries <= 1) {
                        reject(buildError(http.STATUS_CODES[res.statusCode], res.statusCode));
                    } else {
                        tries--;
                        if (res.statusCode === 429) {
                            console.log('warning: throttled by HTTP 429 - waiting ' + timeout + ' ms');
                        }
                        setTimeout(doRequest, timeout);
                    }
                } else {
                    reject(buildError(http.STATUS_CODES[res.statusCode], res.statusCode));
                }
            });
        }
        doRequest();
    }).then(JSON.parse);
}

function getSummonerId(region, name) {
    if (name === null) return new Promise(function(resolve, reject) { reject(buildError('invalid summoner name', 400)); });
    var cacheKey = region + ':' + name;
    return getCache(cacheKey).then(function(id) { return +id; }).catch(function(err) {
        return getRiotApi(region, API_GET_ID + encodeURIComponent(name)).then(function(result) {
            var id = result[name].id;
            memcache.set(cacheKey, id.toString(), null, 60 * 60);
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
        }).map('matchId').value();
        if (matchIds.length === 0) return [];

        return bluebird.promisify(async.mapSeries)(matchIds, function(matchId, callback) {
            getRiotApi(region, API_GET_MATCH + matchId).then(function(match) {
                var newMatch = {
                    matchId: match.matchId,
                    matchCreation: match.matchCreation,
                    matchDuration: match.matchDuration,
                    winner: false,
                };
                var pid = -1;
                for (var participantIdentity of match.participantIdentities) {
                    if (participantIdentity.player.summonerId === id) {
                        pid = participantIdentity.participantId;
                        break;
                    }
                }
                for (var participant of match.participants) {
                    if (participant.participantId === pid) {
                        newMatch.winner = participant.stats.winner;
                        break;
                    }
                }
                var prefix = first ? '{"matches":[' : ',';
                first = false;
                out.write(prefix + JSON.stringify(newMatch));
                out.flush();
                callback(null, newMatch);
            }).catch(function(err) {
                callback(err);
            });
        });
    }).then(function(matches) {
        if (matches.length === 0) {
            return cached;
        } else {
            if (cached.length > 0) {
                out.write(',' + JSON.stringify(cached).slice(1, -1));
            }
            out.end(']}');
            matches = matches.concat(cached);
            memcache.set(cacheKey, JSON.stringify(matches));
            return null;
        }
    }).catch(function(err) {
        console.error(err);
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
    if (!validateRegion(region)) {
        res.send(buildErrorJSONString(buildError('invalid region', 400)));
        return;
    }
    var summoner = getStandardName(req.query.summoner);
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
// Copyright (c) Brandon Lin 2016
