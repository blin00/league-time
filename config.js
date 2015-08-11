const fs = require('fs');

module.exports = Object.freeze({
    port: +process.env.PORT || 8088,
    key: (process.env.RIOT_API_KEY || fs.readFileSync('api.key').toString()).trim(),
    userAgent: 'league-time',
    days: 30,
    checkPeriod: 120,   // seconds
    maxCache: 10000,
});
