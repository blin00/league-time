// jshint devel: true
'use strict';

var d3 = require('d3');

document.addEventListener('DOMContentLoaded', function(event) {
    var img = d3.select('#icon');
    d3.select('#search').on('submit', function() {
        d3.event.preventDefault();
        img.attr('src', '');
        d3.json('/info?summoner=' + encodeURIComponent(d3.select(this).select('input').property('value')), function(err, result) {
            console.log(result);
            if (!err && result.profileIconId) img.attr('src', 'https://ddragon.leagueoflegends.com/cdn/5.13.1/img/profileicon/' + result.profileIconId + '.png');
        });
    });
});
