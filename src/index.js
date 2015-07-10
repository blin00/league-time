'use strict';

var d3 = require('d3');

document.addEventListener('DOMContentLoaded', function(event) {
    var img = d3.select('#icon');
    var form = d3.select('#search');
    if (localStorage) {
        var region = localStorage.getItem('region');
        if (region) form.select('select').property('value', region);
    }
    form.on('submit', function() {
        d3.event.preventDefault();
        var name = form.select('input').property('value').trim();
        var region = form.select('select').property('value');
        if (name.length > 0) {
            img.classed('hidden', true).attr('src', '');
            if (localStorage) localStorage.setItem('region', region);
            d3.select('#result').text('');
            d3.json('/info?region=' + region + '&summoner=' + encodeURIComponent(name), function(err, result) {
                console.log(result);
                //if (!err && result.profileIconId) img.attr('src', 'https://ddragon.leagueoflegends.com/cdn/5.13.1/img/profileicon/' + result.profileIconId + '.png').classed('hidden', false);
                if (err) {
                    d3.select('#result').text(err.message);
                } else if (result.error) {
                    if (result.error.code === 404) {
                        d3.select('#result').text('summoner not found');
                    } else {
                        d3.select('#result').text(result.error.message);
                    }
                } else {
                    d3.select('#result').text(Math.round(result.time / 360) / 10 + ' hrs in ' + result.matches + ' games - ' + Math.round(result.time / result.matches / 6) / 10 + ' min/game');
                }
            });
        }
    });
});
