var request = require("request"),
    fs      = require("fs"),
    d       = require("./debug");

exports.download        = download;
exports.download_exist  = download_exist;
exports.filesize        = filesize;

function download(url, file, cb) {
    request.get(url).pipe(fs.createWriteStream(file)).on('close', function() {
        cb(true);
    }).on('error', function(err) {
        d.error("Failed to download "+url+" to "+file+": "+err, "dl");
        cb(false);
    });
}

function download_exist(url, cb) {
    request({
        url: url,
        method: "HEAD",
        followRedirect: false // don't allow redirects!
    }, function(error, response) {
        if (error) {
            //d.error("Error fetching head for "+url, "dl");
            if (cb) cb(false);
        } else {
            if (response.statusCode != 200) {
                if (cb) cb(false);
            } else {
                if (cb) cb(true);
            }
        }
    });
}

function filesize(url, cb) {
    request({
        url: url,
        method: "HEAD",
        followRedirect: false // don't allow redirects!
    }, function(error, response) {
        if (error) {
            if (cb) cb(0);
        } else {
            if (response.headers && response.headers['content-length']) {
                if (cb) cb(response.headers['content-length']);
            } else {
                if (cb) cb(0);
            }
        }
    });
}