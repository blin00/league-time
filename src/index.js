'use strict';

var d3 = require('d3');

document.addEventListener('DOMContentLoaded', function(event) {
    var img = d3.select('#icon');
    d3.select('#search').on('submit', function() {
        d3.event.preventDefault();
        img.attr('src', '');
        d3.json('/icon?summoner=' + encodeURIComponent(d3.select(this).select('input').property('value')), function(err, result) {
            if (!err && result.icon) img.attr('src', 'https://ddragon.leagueoflegends.com/cdn/5.2.1/img/profileicon/' + result.icon + '.png');
        });
    });
});
