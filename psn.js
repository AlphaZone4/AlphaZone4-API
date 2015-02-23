// PSN functions for internal use...

var PSN     = require("PSNjs"),
    config  = require("./config"),
    md5     = require("./md5"),
    request = require("request"),
    fs      = require("fs"),
    d       = require("./debug"),
    magic   = require('imagemagick'),
    secDL   = require("./secDL"),
    dl      = require("./dl"),
    cache   = require("./cache");

var imdir   = config.cdn_root + "/a";

// sizes to resize to
var sizes = [
    16,
    32,
    50,
    64,
    128,
    150,
    200,
    240 // default full size
];

// exports
exports.get_avatar = download_avatar;
exports.get_home_avatar = fetchHomeAvatar;

// download and resize PSN avatar
function download_avatar(url, cb) {
    // get MD5 hash
    var hash = image(url);
    
    var loc = imdir + "/240/" + hash +".png";
    
    // check if it already exists!
    if (!fs.existsSync( loc )) {
        // no exist!
        request(url, function(err) {
            if (err) {
                return d.error("Error downloading PSN avatar " + url, "psn");
            } else {
                // create thumbnails too
                render_thumbs(hash, function() {
                    // return
                    return cb(hash);
                });
            }
        }).pipe(
            fs.createWriteStream( loc )
        );
    } else {
        return cb(hash);
    }
}

function image(url) {
    // another hash function :D
    return md5.hash(config.hash_avatar.pre + url + config.hash_avatar.post);
}

function render_thumbs(hash, cb) {
    var todo = [];
    
    var render_thumb = function() {
        var size = todo.shift();
        
        if (size) {
            //d.debug("Converting avatar to size "+size);
            magic.resize({
                srcPath: imdir + "/240/" + hash +".png",
                dstPath: imdir + "/" + size + "/" + hash +".png",
                width  : size
            }, function(err, stdout, stderr) {
                if (err) return d.error("Image resize error "+err, "psn");
                
                process.nextTick(render_thumb);
            });
        } else {
            if(cb) cb();
        }
    };
    
    for(var ii=0; ii<sizes.length; ii++) {
        if (!fs.existsSync(imdir + "/" + sizes[ii] + "/" + hash +".png")) todo.push(sizes[ii]);
    }
    
    process.nextTick(render_thumb);
}

var homeAvPath = "/home/cubehouse/sites/cdn/h/";
var homeAvUrl  = "//cdn.alphazone4.com/h/";
function fetchHomeAvatar(username, force, cb) {
    var f = homeAvPath+username+".jpg";
    var u = homeAvUrl+username+".jpg";
    if (!force && fs.existsSync(f)) {
        return cb(u);
    }
    
    secDL.dl("https://cprod.homerewards.online.scee.com:10443/SaveDataService/avatar/cprod/"+username+".jpg",
        f,
        function(file) {
            if (!file.error) {
                return cb(u);
            } else {
                return cb(homeAvUrl+"anon.jpg");
            }
        }
    );
}

// get latest PS3 firmware version
function checkLatestPS3FW() {
    // check when we last checked
//    cache.get("PS3FW", function(err, data) {
//        if (!data) {
            // nothing cached, fetch PS3 FW info
            request("http://fus01.ps3.update.playstation.net/update/ps3/list/us/ps3-updatelist.txt", function(error, response, body) {
                var search = /CompatibleSystemSoftwareVersion=([0-9]*\.[0-9]{2})/g;
                var match = search.exec(body);
                if (match[1]) {
                    var bits = match[1].split("");
                    var res = [];
                    for(var i=0; i<bits.length; i++) {
                        if (bits[i] != ".") {
                            res.push(bits[i]);
                        }
                    }
                    
                    cache.set("PS3FW", res.join("."));
                } else {
                    d.error("Failed to match "+body);
                }
            });
//        }
//    });
}
// check each hour
checkLatestPS3FW();
setInterval(checkLatestPS3FW, 1000*60*60);

