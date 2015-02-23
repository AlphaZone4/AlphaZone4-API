// TODO - get update lists
var updates = require("../updates"),
    api     = require("../api"),
    cache   = require("../cache"),
    d       = require("../debug"),
    auth    = require("../auth");
    
var cache_key  = "az4update:";
var cache_time = 60 * 60 * 2; // 2 hour cache :)

api.assign("/get/update/", function(args, cb) {
    if (!args.inputs[0]) return cb({error: "No update ID given"});
    
    auth.isCached(args, function(skip_cache) {
        if (skip_cache) {
            updates.get(args.inputs[0], function(d) {
                cb(d);
                // cache the response! :)
                cache.cache(cache_key + args.inputs[0], JSON.stringify(d), cache_time);
            });
        } else {
            // check the cache
            cache.get(cache_key + args.inputs[0], function(err, data) {
                if (err) {
                    d.error("Cache error fetching "+cache_key + args.inputs[0], "mod_updates");
                }
                
                if (data) {
                    cb(JSON.parse(data));
                } else {
                    updates.get(args.inputs[0], function(d) {
                        cb(d);
                        // cache the response! :)
                        cache.cache(cache_key + args.inputs[0], JSON.stringify(d), cache_time);
                    });
                }
            });
        }
    });
    
    // return false to stop output
    return false;
});