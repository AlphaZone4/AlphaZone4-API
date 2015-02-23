// define the GET functions for categories

var api     = require("../api"),
    cats    = require("../cats"),
    cache   = require("../cache"),
    d       = require("../debug"),
    auth    = require("../auth");

var cache_key   = "az4cats:";
var cache_time  = 3000;

// get/cat/{id}

api.assign("/get/cat/", function(args, cb) {
    // check we have a cat ID passed
    if (!args.inputs[0]) return cb({error: "No category ID given"});
    
    auth.check(args, "itemdatabase_scan", function(e) {
        // if we're not an admin/mod
        if (!e) {
            // check the cache
            cache.get(cache_key + args.inputs[0], function(err, data) {
                if (err) {
                    d.error("Cache error fetching "+cache_key + args.inputs[0], "mod_cats");
                }
                
                if (data) {
                    cb(JSON.parse(data));
                } else {
                    cats.get(args.inputs[0], function(d) {
                        cb(d);
                        // cache the response! :)
                        cache.cache(cache_key + args.inputs[0], JSON.stringify(d), cache_time);
                    });
                }
            });
        } else {
            // admin/mod! show all items in this category
            cats.get(args.inputs[0], true, function(d) {
                cb(d);
            });
        }
    });
});