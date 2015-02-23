// define the GET functions for items

var api     = require("../api"),
    item    = require("../item"),
    cache   = require("../cache"),
    d       = require("../debug");

var cache_key  = "az4item:";
var cache_time = 3000;

api.assign("/get/items/", function(args, cb) {
    if (!args.query['id']) return cb({error: "No item IDs given"});

    item.gets(args.query['id'].split(','), function(d) {
        cb(d);
    });
});

// get/item/{id}

api.assign("/get/item/", function(args, cb) {
    // check we have a item ID passed
    if (!args.inputs[0]) return cb({error: "No item ID given"});
    
    // check the cache
    cache.get(cache_key + args.inputs[0], function(err, data) {
        if (err) {
            d.error("Cache error fetching "+cache_key + args.inputs[0], "mod_item");
        }
        
        if (data) {
            cb(JSON.parse(data));
        } else {
            item.get(args.inputs[0], function(d) {
                cb(d);
                // cache the response! :)
                //cache.cache(cache_key + args.inputs[0], JSON.stringify(d), cache_time);
            });
        }
    });
    
    // return false to stop output
    return false;
});


// get/guid/{GUID}
api.assign("/get/guid/", function(args, cb) {
    // were we actually given a GUID?
    if (!args.inputs[0]) return cb({error: "No item GUID given"});

    if (args.query['tnum']) {
        // tnum! yay
        item.getGUID(args.inputs[0], args.query['tnum'], cb);
    } else {
        // no tnum supplied
        // fetch item
        item.getGUID(args.inputs[0], null, cb);
    }
});
