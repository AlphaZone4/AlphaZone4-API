// AZ4 Cache Module
//  basically just redis, but with a cache function and auto-connected

var redis = require("redis"),
    client = redis.createClient(),
    config = require("./config");

client.on("error", function (err) {
    console.log("[Cache] Error " + err);
});

function _set(key, val, expire) {
    if (config.cache_pre) key = config.cache_pre + key;
    
    client.set(key, val);
    
    if (expire) {
        client.expire(key, expire);
    }
}

function cache(key, val, time) {
    // shortcut function to cache things
    _set(key, val, time ? time : (config.cache ? config.cache : 300), function(e) {
        console.log(e);
    });
}

client.cache = cache;

module.exports = client;
