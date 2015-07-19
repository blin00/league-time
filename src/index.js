'use strict';

var d3 = require('d3'),
    oboe = require('oboe');

document.addEventListener('DOMContentLoaded', function(event) {
    var img = d3.select('#icon');
    var form = d3.select('#search');
    var status = d3.select('#status');
    if (localStorage) {
        var region = localStorage.getItem('region');
        if (region) form.select('select').property('value', region);
    }
    form.on('submit', function() {
        d3.event.preventDefault();
        var name = form.select('input').property('value').trim();
        var region = form.select('select').property('value');
        if (name.length > 0) {
            if (form.select('button').classed('disabled')) return;
            form.select('button').classed('disabled', true);
            img.classed('hidden', true).attr('src', '');
            if (localStorage) localStorage.setItem('region', region);
            status.text('loading...');
            var things = d3.select('#result');
            things.selectAll('div.match').remove();
            oboe('/info?region=' + region + '&summoner=' + encodeURIComponent(name)).node('!.$matches.*', function(matches) {
                things.selectAll('div.match').data(matches, function(d) { return d.matchId; }).enter().append('div').classed('match', true).text(function(d) {
                    return new Date(d.matchCreation).toString() + ': ' + getPrettyDuration(d.matchDuration) + ' | ' + (d.winner ? 'W' : 'L');
                });
            }).done(function(json) {
                if (json.error) {
                    status.text('error: ' + json.error.message);
                } else {
                    status.text('done');
                }
                form.select('button').classed('disabled', false);
            }).fail(function(err) {
                status.text('error: ' + JSON.stringify(err));
                form.select('button').classed('disabled', false);
            });
        }
    });
});

function getPrettyDuration(duration) {
    var minutes = Math.floor(duration / 60);
    var seconds = duration - minutes * 60;
    return padNum(minutes, 2) + ':' + padNum(seconds, 2);
}

function padNum(num, len) {
    num = num.toString();
    while (num.length < len) num = '0' + num;
    return num;
}
