'use strict';

var d3 = require('d3'),
    oboe = require('oboe'),
    sum = require('lodash/sum'),
    reduce = require('lodash/reduce'),
    map = require('lodash/map'),
    throttle = require('lodash/throttle');

require('d3-tip')(d3);

var tip;

document.addEventListener('DOMContentLoaded', function(event) {
    function onSubmit() {
        if (d3.event) d3.event.preventDefault();
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
            graph.attr('width', '0').attr('height', '0').select('g').remove();
            oboe('/matches?region=' + region + '&summoner=' + encodeURIComponent(name)).node('!.$matches.*', function(matches) {
                matchDisplay.selectAll('div.match').data(matches, function(d) { return d.matchId; }).enter().append('div').classed('match', true).text(function(d) {
                    return dateFormatter(new Date(d.matchCreation)) + ': ' + getPrettyDuration(d.matchDuration) + ' | ' + (d.winner ? 'W' : 'L');
                });
                drawBarGraphThrottled(graph, getMatchesByDay(matches));
            }).done(function(json) {
                if (json.error) {
                    status.text('error: ' + json.error.message);
                } else {
                    status.text('done');
                }
                form.select('button').classed('disabled', false);
                var matches = json.matches || [];
                // force immediate draw of bar graph
                var matchesByDay = getMatchesByDay(matches);
                drawBarGraphThrottled.cancel();
                drawBarGraph(graph, matchesByDay);
                var total = sum(map(matches, 'matchDuration'));
                var wins = reduce(map(matches, 'winner'), function(total, winner) { return total + (winner ? 1 : 0); }, 0);
                stats.append('div').text('won ' + wins + '/' + matches.length + ' games (' + Math.round(wins / matches.length * 1000) / 10 + '%)');
                stats.append('div').text('total time: ' + Math.round(total / 360) / 10 + ' hrs');
                stats.append('div').text('avg time/game: ' + getPrettyDuration(total / matches.length));
                stats.append('div').text('avg time/day: ' + Math.round(total / matchesByDay.length / 360) / 10 + ' hrs');
            }).fail(function(err) {
                console.log(err);
                if (err.jsonBody && err.jsonBody.error) {
                    status.text('error: ' + err.jsonBody.error.message);
                } else {
                    status.text('error: ' + err.statusCode);
                }
                form.select('button').classed('disabled', false);
            });
        }
    }
    var img = d3.select('#icon');
    var form = d3.select('#search');
    var status = d3.select('#status');
    var matchDisplay = d3.select('#matches');
    var stats = d3.select('#stats');
    // only certain methods (not classed) are proxied :\
    tip = d3.tip().attr('class', 'd3-tip').offset([-10, 0]).html(function(d) {
        return Math.round(d.time * 10) / 10 + ' hrs';
    });
    var graph = d3.select('#graph').append('svg').attr('width', '0').attr('height', '0');
    graph.call(tip);
    if (localStorage) {
        var region = localStorage.getItem('region');
        if (region) form.select('select').property('value', region);
    }
    var dateFormatter = d3.time.format('%a %b %e %Y %I:%M %p');
    d3.select('#matchesToggle').on('click', function() {
        var hidden = matchDisplay.classed('hidden');
        matchDisplay.classed('hidden', !hidden);
        d3.select(this).text((hidden ? 'hide' : 'show') + ' match data');
    });
    form.on('submit', onSubmit);
    if (window.location.hash) {
        var str = window.location.hash.slice(1);
        if (str) {
            form.select('input')[0][0].value = str;
            onSubmit();
        }
    }
});

function getPrettyDuration(duration) {
    var minutes = Math.floor(duration / 60);
    var seconds = duration - minutes * 60;
    return minutes + ':' + padNum(seconds, 2);
}

function padNum(num, len) {
    num = Math.round(num).toString();
    while (num.length < len) num = '0' + num;
    return num;
}

function drawBarGraph(graph, matchesByDay) {
    var defaultColor = 'steelblue';
    var hoverColor = 'lightsteelblue';
    var width = 750, height = 250, margin = { top: 20, left: 25, right: 25, bottom: 75 };
    graph.select('g').remove();
    var root = graph.attr('width', width + margin.left + margin.right).attr('height', height + margin.top + margin.bottom)
        .append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
    var x = d3.scale.ordinal().rangeRoundBands([0, width], 0.05);
    var y = d3.scale.linear().range([height, 0]);
    var xAxis = d3.svg.axis().scale(x).orient('bottom').tickFormat(d3.time.format('%Y-%m-%d'));
    var yAxis = d3.svg.axis().scale(y).orient('left').ticks(10);
    x.domain(map(matchesByDay, 'day'));
    y.domain([0, d3.max(matchesByDay, function(d) { return d.time; })]);
    root.append('g').classed('axis', true).attr('transform', 'translate(0,' + height + ')').call(xAxis)
        .selectAll('text').style('text-anchor', 'end').attr('dx', '-.8em').attr('dy', '-.55em').attr('transform', 'rotate(-90)');
    root.append('g').classed('axis', true).call(yAxis)
        .append('text').attr('transform', 'rotate(-90)').attr('y', 6).attr('dy', '.71em').style('text-anchor', 'end').text('Time (hr)');
    root.selectAll('rect.bar').data(matchesByDay).enter()
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
var drawBarGraphThrottled = throttle(drawBarGraph, 500, {leading: false});

function getMatchesByDay(matches) {
    if (matches.length === 0) return [];
    var days = d3.time.days(d3.time.day(new Date(matches[matches.length - 1].matchCreation)), matches[0].matchCreation + 1);
    var result = new Array(days.length);
    result[0] = {day: days[0], matches: 0, time: 0};
    var i, j = 0;
    for (i = matches.length - 1; i >= 0; i--) {
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
