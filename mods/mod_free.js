// Free lists API methods
var free    = require("../free"),
    api     = require("../api"),
    cache   = require("../cache"),
    d       = require("../debug");
    
var cache_key  = "az4free:";
var cache_time = 60 * 60 * 12; // 12 hour cache :)

api.assign("/get/free/", function(args, cb) {
    if (!args.inputs[0]) return cb({error: "No region given"});
    
    // check the cache
    cache.get(cache_key + args.inputs[0], function(err, data) {
        if (err) {
            d.error("Cache error fetching "+cache_key + args.inputs[0], "mod_free");
        }
        
        if (data) {
            cb(JSON.parse(data));
        } else {
            free.get(args.inputs[0], function(d) {
                cb(d);
                // cache the response! :)
                cache.cache(cache_key + args.inputs[0], JSON.stringify(d), cache_time);
            });
        }
    });
    
    // return false to stop output
    return false;
});