'use strict';

var _ = require('lodash'),
    d3 = require('d3'),
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
                /*
                //if (!err && result.profileIconId) img.attr('src', 'https://ddragon.leagueoflegends.com/cdn/5.13.1/img/profileicon/' + result.profileIconId + '.png').classed('hidden', false);
                form.select('button').classed('disabled', false);
                if (err) {
                    status.text(err.message);
                } else if (result.error) {
                    if (result.error.code === 404) {
                        status.text('summoner not found');
                    } else {
                        status.text(result.error.message);
                    }
                } else {
                    var matchStartTimes = _.pluck(result.matches, 'matchCreation').map(function(m) {
                        return new Date(m);
                    });
                    console.log(matchStartTimes);

                    //status.text(Math.round(result.time / 360) / 10 + ' hrs spent on ' + result.matches + ' games (' + result.wins + ' wins) - ' + Math.round(result.time / result.matches / 6) / 10 + ' min per game (past ' + result.days + ' days)');
                }
                */
                things.selectAll('div.match').data(matches).enter().append('div').classed('match', true).text(function(d) {
                    return new Date(d.matchCreation).toString() + ': ' + getPrettyDuration(d.matchDuration) + ' | ' + (d.participants[0].stats.winner ? 'W' : 'L');
                });
            }).done(function(json) {
                status.text('done');
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
