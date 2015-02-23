
var exec    = require('child_process').exec,
    fs      = require("fs");

var err404 = /404 Not Found/g;

// download a secure file, a temp location must be provided (sorry)
exports.dl = dl;
function dl(url, out, cb) {
    var child = exec('/home/cubehouse/storeparser/dlSecure.sh ' + url + " > " + out,
        function (error, stdout, stderr) {
            if (stderr) {
                return cb({error: "Unable to download: "+stderr});
            }
            
            // read file to check for 404 etc.
            fs.readFile(out, function(err, data) {
                if (err) {
                    return cb({error: "File not written"});
                }
                
                if (err404.test(data)) {
                    fs.unlink(out, function() {
                        return cb({error: "404 - File not found."});
                    });
                } else {
                    return cb({file: out, data: data});
                }
            });
        }
    );
}

