'use strict';

var config = require('./config'),
    path = require('path'),
    express = require('express'),
    compression = require('compression'),
    favicon = require('serve-favicon'),
    request = require('request').defaults({headers: {'User-Agent': config.userAgent}});

var API_GET_ID = '/v1.4/summoner/by-name/';

function buildApi(region) {
    return 'https://' + region + '.api.pvp.net/api/lol/' + region;
}

function getRiotApi(uri, callback, tries) {
    if (tries === undefined) {
        tries = 5;
    }
    request(uri + '?api_key=' + config.key, function(err, res, body) {
        if (err) callback(err);
        else if (res.statusCode >= 200 && res.statusCode < 300) {
            var result;
            try {
                result = JSON.parse(body);
            } catch (e) {
                callback(new Error('JSON parse error: ' + e.message));
                return;
            }
            callback(null, result);
        } else if (res.statusCode === 429) {
            console.log('throttling...');
            if (tries <= 1) {
                callback(new Error('too many attempts'));
            } else {
                setTimeout(getRiotApi, 2500, uri, callback, tries - 1);
            }
        } else {
            var error = new Error('HTTP ' + res.statusCode);
            error.code = res.statusCode;
            callback(error);
        }
    });
}

function getSummonerInfo(name, callback) {
    var canonicalName = getStandardName(name);
    getRiotApi(buildApi('na') + API_GET_ID + encodeURIComponent(canonicalName), function(err, result) {
        if (err) callback(err);
        else callback(null, result[canonicalName]);
    });
}

function getStandardName(name) {
    if (typeof name !== 'string') {
        return null;
    }
    return name.toLocaleLowerCase().replace(/\s/g, '');
}

var app = express();
app.set('view engine', 'jade');
app.use(compression());
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', function(req, res) {
    res.render('index', {});
});

app.get('/info', function(req, res) {
    res.set('Content-Type', 'application/json');
    getSummonerInfo(req.query.summoner, function(err, result) {
        if (err) res.send(JSON.stringify({error: {message: err.message, code: err.code}}));
        else res.send(JSON.stringify(result));
    });
});

app.listen(config.port, function() {
    console.log((app.get('env') === 'production' ? '' : '\x07') + 'server listening on port ' + config.port);
});
