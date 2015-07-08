'use strict';

var path = require('path'),
    express = require('express'),
    compression = require('compression'),
    async = require('async'),
    request = require('request'),
    config = require('./config');

function getSummonerId(name, callback) {

}

function getStandardName(name) {
    return name.toLocaleLowerCase().replace(/\s/g, '');
}

var app = express();
app.set('view engine', 'jade');
app.use(compression());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', function(req, res) {
    res.render('index', {});
});

app.listen(config.port, function() {
    console.log((app.get('env') === 'production' ? '' : '\x07') + 'server listening on port ' + config.port);
});
