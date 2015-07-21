'use strict';

var d3 = require('d3'),
    oboe = require('oboe'),
    sum = require('lodash/math/sum'),
    reduce = require('lodash/collection/reduce'),
    pluck = require('lodash/collection/pluck');

require('d3-tip')(d3);

var tip;

document.addEventListener('DOMContentLoaded', function(event) {
    var img = d3.select('#icon');
    var form = d3.select('#search');
    var status = d3.select('#status');
    var matchDisplay = d3.select('#matches');
    var stats = d3.select('#stats');
    var graph = d3.select('#graph');
    // only certain methods are proxied :\
    tip = d3.tip().attr('class', 'd3-tip').offset([-10, 0]).html(function(d) {
        return Math.round(d.time * 10) / 10 + ' hrs';
    });
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
            graph.selectAll('svg').remove();
            oboe('/matches?region=' + region + '&summoner=' + encodeURIComponent(name)).node('!.$matches.*', function(matches) {
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
                var matches = (json.matches || []).slice().reverse();
                var days = json.days || 0;
                var total = sum(pluck(matches, 'matchDuration'));
                var wins = reduce(pluck(matches, 'winner'), function(total, n) { return total + (n ? 1 : 0); }, 0);
                stats.append('div').text('matches: ' + matches.length);
                stats.append('div').text('wins: ' + wins);
                stats.append('div').text('win percentage: ' + Math.round(wins / matches.length * 1000) / 10 + '%');
                stats.append('div').text('total time: ' + Math.round(total / 360) / 10 + ' hrs');
                stats.append('div').text('avg time/match: ' + getPrettyDuration(total / matches.length));
                stats.append('div').text('avg time/day: ' + Math.round(total / days / 360) / 10 + ' hrs');
                drawBarGraph(graph, matches);
            }).fail(function(err) {
                console.log(err);
                status.text('error: ' + JSON.stringify(err));
                form.select('button').classed('disabled', false);
            });
        }
    });
    d3.select('#matchesToggle').on('click', function() {
        var hidden = matchDisplay.classed('hidden');
        matchDisplay.classed('hidden', !hidden);
        d3.select(this).text((hidden ? 'hide' : 'show') + ' match data');
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

function drawBarGraph(graph, matches) {
    var defaultColor = 'steelblue';
    var hoverColor = 'lightsteelblue';
    matches = getMatchesByDay(matches);
    var width = 750, height = 250, margin = { top: 20, left: 25, right: 25, bottom: 75 };
    var svg = graph.append('svg').attr('width', width + margin.left + margin.right).attr('height', height + margin.top + margin.bottom)
        .append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
    svg.call(tip);
    var x = d3.scale.ordinal().rangeRoundBands([0, width], 0.05);
    var y = d3.scale.linear().range([height, 0]);
    var xAxis = d3.svg.axis().scale(x).orient('bottom').tickFormat(d3.time.format('%Y-%m-%d'));
    var yAxis = d3.svg.axis().scale(y).orient('left').ticks(10);
    x.domain(pluck(matches, 'day'));
    y.domain([0, d3.max(matches, function(d) { return d.time; })]);
    svg.append('g').classed('axis', true).attr('transform', 'translate(0,' + height + ')').call(xAxis)
        .selectAll('text').style('text-anchor', 'end').attr('dx', '-.8em').attr('dy', '-.55em').attr('transform', 'rotate(-90)');
    svg.append('g').classed('axis', true).call(yAxis)
        .append('text').attr('transform', 'rotate(-90)').attr('y', 6).attr('dy', '.71em').style('text-anchor', 'end').text('Time (hr)');
    svg.selectAll('rect.bar').data(matches).enter()
        .append('rect').classed('bar', true).style('fill', defaultColor).attr('x', function(d) { return x(d.day); }).attr('width', x.rangeBand()).attr('y', function(d) { return y(d.time); }).attr('height', function(d) { return height - y(d.time); })
        .on('mouseover', function(d) {
            d3.select(this).style('fill', hoverColor);
            tip.show(d);
        })
        .on('mouseout', function(d) {
            d3.select(this).style('fill', defaultColor);
            tip.hide(d);
        });
}

function getMatchesByDay(matches) {
    if (matches.length === 0) return [];
    var days = d3.time.days(d3.time.day(new Date(matches[0].matchCreation)), matches[matches.length - 1].matchCreation + 1);
    var result = new Array(days.length);
    result[0] = {day: days[0], matches: 0, time: 0};
    var i, j = 0, len;
    for (i = 0, len = matches.length; i < len; i++) {
        var match = matches[i];
        while (+d3.time.day(new Date(match.matchCreation)) !== +days[j]) {
            j++;
            result[j] = {day: days[j], matches: 0, time: 0};
        }
        result[j].matches++;
        result[j].time += match.matchDuration / 3600;
    }
    return result;
}
