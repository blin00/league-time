var fs = require('fs');

module.exports = {
    port: 8088,
    key: fs.readFileSync('api.key').toString().trim(),
};
