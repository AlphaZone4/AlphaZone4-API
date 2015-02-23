// hilariously basic MD5 library

var crypto = require('crypto');

exports.hash = function(data) {
    return crypto.createHash('md5').update(data).digest("hex");
}