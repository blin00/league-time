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

// now actually platforms
// const REGIONS = ['na', 'br', 'eune', 'euw', 'kr', 'lan', 'las', 'oce', 'ru', 'tr'];
const REGIONS = ['na1'];
const SORTED_REGIONS = REGIONS.slice().sort();
const MAX_REGION_LENGTH = _(REGIONS).maxBy('length');

const API_GET_ID = 'summoner/v3/summoners/by-name/';
const API_GET_MATCH = 'match/v3/matches/';
const API_GET_MATCHLIST = 'match/v3/matchlists/by-account/';

const SEARCH_ID_PREFIX = 'id:';

const memcache = memjs.Client.create(config.memcachedServer, {username: config.memcachedUser, password: config.memcachedPass});

function getCache(key) {
    return new Promise(function(resolve, reject) {
        memcache.get(key, function(err, value) {
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
    tries = tries || 5;
    return new Promise(function(resolve, reject) {
        function doRequest() {
            const theRequest = `https://${region}.api.riotgames.com/lol/${api}`;
            console.log(`doRequest(${theRequest})`);
            request(theRequest, function(err, res, body) {
                if (err) {
                    err.code = 500;
                    reject(err);
                } else if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(body);
                } else if (res.statusCode !== 403 && res.statusCode !== 404 && res.statusCode !== 422) {
                    var timeout = res.headers['retry-after'];
                    if (timeout) timeout = (+timeout) * 1000 + 500;
                    else timeout = 3333;
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

function getAccountId(region, name) {
    if (name == null) return Promise.reject(buildError('invalid summoner name', 400));
    if (name.startsWith(SEARCH_ID_PREFIX)) {
        return Promise.resolve(+name.slice(SEARCH_ID_PREFIX.length));
    }
    const cacheKey = 'name:' + region + ':' + name;
    return getCache(cacheKey).then(function(id) { return +id; }).catch(function(err) {
        return getRiotApi(region, API_GET_ID + encodeURIComponent(name)).then(function(result) {
            const id = result.accountId;
            memcache.set(cacheKey, id.toString(), {expires: 60 * 60});
            return id;
        });
    });
}

function getMatchListById(region, id, out) {
    const cachePrefix = 'game:';
    var first = true;
    const nowDay = d3.time.day(new Date());
    const backDay = config.days < 0 ? 0 : +d3.time.day.offset(nowDay, -config.days);
    return getRiotApi(region, API_GET_MATCHLIST + id + `?beginTime=${backDay}`).then(function(result) {
        const matchList = result.matches;
        const gameIds = _(matchList).map('gameId').value();
        if (gameIds.length === 0) return [];

        return bluebird.promisify(async.mapLimit)(gameIds, 16, function(gameId, callback) {
            getCache(cachePrefix + gameId).then(function(matchJson) {
                callback(null, JSON.parse(matchJson));
            }).catch(function(err) {
                callback(null, {gameId: gameId});
            });
        });
    }).then(function(games) {
        return bluebird.promisify(async.mapSeries)(games, function(game, callback) {
            if (game.gameDuration) callback(null, game);
            else {
                const gameId = game.gameId;
                getRiotApi(region, API_GET_MATCH + gameId).then(function(match) {
                    var newMatch = {
                        gameId: match.gameId,
                        gameCreation: match.gameCreation,
                        gameDuration: match.gameDuration,
                        win: false,
                    };
                    var pid = -1;
                    for (const participantIdentity of match.participantIdentities) {
                        if (participantIdentity.player.accountId === id) {
                            pid = participantIdentity.participantId;
                            break;
                        }
                    }
                    for (const participant of match.participants) {
                        if (participant.participantId === pid) {
                            newMatch.win = participant.stats.win;
                            break;
                        }
                    }
                    const newMatchJson = JSON.stringify(newMatch);
                    // TODO: stream results
                    // const prefix = first ? '{"matches":[' : ',';
                    // first = false;
                    // out.write(prefix + newMatchJson);
                    // out.flush();
                    memcache.set(cachePrefix + gameId, newMatchJson);
                    callback(null, newMatch);
                }).catch(function(err) {
                    callback(err);
                });
            }
        });
    }).then(function(matches) {
        if (first) {
            return matches;
        } else {
            out.end(']}');
            return null;
        }
    }).catch(function(err) {
        console.log(err);
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
    res.render('index', {regions: REGIONS, production: production, dnt: req.get('DNT') === '1'});
});

app.get('/matches', function(req, res) {
    res.set('Content-Type', 'application/json');
    var region = req.query.region;
    if (!validateRegion(region)) {
        res.status(400).send(buildErrorJSONString(buildError('invalid region', 400)));
        return;
    }
    var summoner = getStandardName(req.query.summoner);
    getAccountId(region, summoner).then(function(id) {
        return getMatchListById(region, id, res);
    }).then(function(result) {
        if (result != null) res.send({matches: result});
    }).catch(function(err) {
        res.status(err.code).send(buildErrorJSONString(err));
    });
});

app.listen(config.port, function() {
    console.log((production ? '' : '\x07') + 'server listening on port ' + config.port);
});

// Copyright (c) Brandon Lin 2017
