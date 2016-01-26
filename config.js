/*
    Additionally, env var NPM_CONFIG_PRODUCTION must be set to false i.e.
    heroku config:set NPM_CONFIG_PRODUCTION=false
*/

const fs = require('fs');

const config = {
    port: +process.env.PORT || 8088,
    riotKey: process.env.RIOT_API_KEY || fs.readFileSync('api.key').toString().trim(),
    userAgent: 'league-time',
    days: 30,
};

if (process.env.MEMCACHEDCLOUD_SERVERS && process.env.MEMCACHEDCLOUD_USERNAME && process.env.MEMCACHEDCLOUD_PASSWORD) {
    config.memcachedServer = process.env.MEMCACHEDCLOUD_SERVERS;
    config.memcachedUser = process.env.MEMCACHEDCLOUD_USERNAME;
    config.memcachedPass = process.env.MEMCACHEDCLOUD_PASSWORD;
} else {
    var creds = fs.readFileSync('memcached.key').toString().trim().split('|');
    config.memcachedServer = creds[0];
    config.memcachedUser = creds[1];
    config.memcachedPass = creds[2];
}

module.exports = Object.freeze(config);
