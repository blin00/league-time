'use strict';

var express = require('express'),
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

app.get('/', function(req, res) {
    res.render('index', {});
});

app.listen(config.port, function() {
    console.log((app.get('env') === 'production' ? '' : '\x07') + 'server listening on port ' + config.port);
});
