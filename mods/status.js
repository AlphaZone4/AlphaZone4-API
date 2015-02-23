// Status module
//  grabs Home's and other statuses

var Rcon    = require('rcon'),
    cache   = require("../cache"),
    confer  = require("../conf"),
    api     = require("../api"),
    d       = require("../debug"),
    config  = require("../config"),
    az4status = require("../status");

// set to require a config file to run
exports.req_config = true;

// ========== default config ============

var conf = {
    minecraft: false
};

exports.run = function(_conf) {
    if (!_conf) _conf = {};
    
    // merge configs together
    conf = confer.merge(conf, _conf);
};

var cache_key  = "apistatus";
var cache_time = 60;

var home_status = true;
az4status.online(function(t){
    home_status = !t;
});

api.assign("/status", function(args, cb) {
    // check the cache
    cache.get(cache_key, function(err, data) {
        if (err) {
            d.error("Cache error fetching "+cache_key, "status");
        }
        
        if (data) {
            cb(JSON.parse(data));
        } else {
            minecraft(function(d) {
                az4status.online(function(t){
                    var ret = {
                        status: t ? "1" : "0",
                        mc: d
                    };
                    cb(ret);
                    // cache the response! :)
                    cache.cache(cache_key, JSON.stringify(ret), cache_time);
                });
            });
        }
    });
});

// Minecraft functions

function minecraft(cb) {
    if (!conf.minecraft) return cb(false);
    
    // check the cache
    cache.get("mcstatus", function(err, data) {
        if (data) {
            return cb(JSON.parse(data));
        } else {
            var conn = new Rcon(
                conf.minecraft.server,
                conf.minecraft.port,
                conf.minecraft.password
            );
            
            conn.on('error', function() {
                return cb(false);
            });
            
            conn.on('auth', function() {
                // sedn request for player list
                conn.send("list");
            });
            
            conn.on('response', function(str) {
                // first, format the string
                str = mcformat(str);
                
                // get stats
                var stats = /There are ([0-9]+) out of maximum ([0-9]+) players online./.exec(str);
                
                if (!stats) return cb(false);
                
                // get list of players
                str = str.substring(str.indexOf("Connected players:")+18);
                var players = str.match(/([^,^\n^\s^\u0000\u0000])+/g);
                
                // update cache
                var ret = {
                    online : stats[1],
                    max    : stats[2],
                    players: players
                };
                
                conn.disconnect();
                
                if (cb) cb(ret);
                
                // cache response
                cache.cache("mcstatus", JSON.stringify(ret), 300);
            });
            
            conn.connect();
        }
    });
    
    
}

var mcformat = function(str) {
    // colour codes
    str = str.replace(/\uFFFD[a-f0-9]/g, "");
    str = str.replace(/\[AFK\]/g, "");
    str = str.replace(/\u00A7([klmnor])/g, "");
    
    return str;
};

if (!module.parent) {
    minecraft(function(a) {
        console.log(a);
    });
}
