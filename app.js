'use strict';

var config = require('./config'),
    _ = require('lodash'),
    path = require('path'),
    express = require('express'),
    compression = require('compression'),
    favicon = require('serve-favicon'),
    NodeCache = require('node-cache'),
    request = require('request').defaults({headers: {'User-Agent': config.userAgent}});

const REGIONS = ['na', 'br', 'eune', 'euw', 'kr', 'lan', 'las', 'oce', 'ru', 'tr'];
const SORTED_REGIONS = REGIONS.slice().sort();

const API_GET_ID = '/v1.4/summoner/by-name/';

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
    request(`https://${region}.api.pvp.net/api/lol/${region}${api}'?api_key=${config.key}`, function(err, res, body) {
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
                setTimeout(getRiotApi, 2500, region, api, callback, tries - 1);
            }
        } else {
            callback(buildError('HTTP ' + res.statusCode), res.statusCode);
        }
    });
}

var getSummonerInfo = buildCache(60, function(region, name, callback) {
    getRiotApi(region, API_GET_ID + encodeURIComponent(name), function(err, result) {
        if (err) callback(err);
        else callback(null, result[name]);
    });
});

function getStandardName(name) {
    if (typeof name !== 'string') {
        return null;
    }
    return name.toLocaleLowerCase().replace(/\s/g, '');
}

var app = express();
app.set('view engine', 'jade');
app.set('views', path.join(__dirname, 'src'));
app.use(compression());
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(express.static(path.join(__dirname, 'public')));

var production = app.get('env') === 'production';

app.get('/', function(req, res) {
    res.render('index', {regions: REGIONS, production: production});
});

app.get('/info', function(req, res) {
    res.set('Content-Type', 'application/json');
    getSummonerInfo(req.query.region, getStandardName(req.query.summoner), function(err, result) {
        if (err) res.send(JSON.stringify({error: {message: err.message, code: err.code}}));
        else res.send(JSON.stringify(result));
    });
});

app.listen(config.port, function() {
    console.log((production ? '' : '\x07') + 'server listening on port ' + config.port);
});
