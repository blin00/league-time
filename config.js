var fs = require('fs');

module.exports = {
    port: process.env.PORT || 8088,
    key: process.env.API_KEY.trim() || fs.readFileSync('api.key').toString().trim(),
    region: 'na',
};
