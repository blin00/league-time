const fs = require('fs');

module.exports = Object.freeze({
    port: process.env.PORT || 8088,
    key: (process.env.API_KEY || fs.readFileSync('api.key').toString()).trim(),
    region: 'na',
    userAgent: 'league-time',
});
