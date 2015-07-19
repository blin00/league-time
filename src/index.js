'use strict';

var d3 = require('d3'),
    _ = require('lodash'),
    oboe = require('oboe');

document.addEventListener('DOMContentLoaded', function(event) {
    var img = d3.select('#icon');
    var form = d3.select('#search');
    var status = d3.select('#status');
    var matchDisplay = d3.select('#matches');
    var stats = d3.select('#stats');
    if (localStorage) {
        var region = localStorage.getItem('region');
        if (region) form.select('select').property('value', region);
    }
    var dateFormatter = d3.time.format('%a %b %e %Y %I:%M %p');
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
            matchDisplay.selectAll('div.match').remove();
            stats.selectAll('div').remove();
            oboe('/info?region=' + region + '&summoner=' + encodeURIComponent(name)).node('!.$matches.*', function(matches) {
                matchDisplay.selectAll('div.match').data(matches, function(d) { return d.matchId; }).enter().append('div').classed('match', true).text(function(d) {
                    return dateFormatter(new Date(d.matchCreation)) + ': ' + getPrettyDuration(d.matchDuration) + ' | ' + (d.winner ? 'W' : 'L');
                });
            }).done(function(json) {
                if (json.error) {
                    status.text('error: ' + json.error.message);
                } else {
                    status.text('done');
                }
                form.select('button').classed('disabled', false);
                var matches = json.matches || [];
                var days = json.days || 0;
                var total = _.reduce(_.pluck(matches, 'matchDuration'), _.add);
                var wins = _.reduce(_.pluck(matches, 'winner'), function(total, n) { return total + (n ? 1 : 0); }, 0);
                stats.append('div').text('matches: ' + matches.length);
                stats.append('div').text('wins: ' + wins);
                stats.append('div').text('win percentage: ' + Math.round(wins / matches.length * 1000) / 10 + '%');
                stats.append('div').text('total time: ' + Math.round(total / 360) / 10 + ' hrs');
                stats.append('div').text('avg time/match: ' + getPrettyDuration(total / matches.length));
                stats.append('div').text('avg time/day: ' + Math.round(total / days / 360) / 10 + ' hrs');
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
    num = Math.round(num).toString();
    while (num.length < len) num = '0' + num;
    return num;
}
