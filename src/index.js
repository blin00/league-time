'use strict';

var d3 = require('d3');

document.addEventListener('DOMContentLoaded', function(event) {
    var img = d3.select('#icon');
    d3.select('#search').on('submit', function() {
        d3.event.preventDefault();
        var form = d3.select(this);
        img.classed('hidden', true).attr('src', '');
        d3.json('/info?region=' + form.select('select').property('value') + '&summoner=' + encodeURIComponent(form.select('input').property('value')), function(err, result) {
            if (!err && result.profileIconId) img.attr('src', 'https://ddragon.leagueoflegends.com/cdn/5.13.1/img/profileicon/' + result.profileIconId + '.png').classed('hidden', false);
        });
    });
});
