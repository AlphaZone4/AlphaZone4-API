// PSN related joy

var PSN     = require("PSNjs"),
    api     = require("../api"),
    cache   = require("../cache"),
    p       = require("../psn");

var fetch_limit = 60 * 30; // half hour

api.assign("/psn/region/", function(args, cb) {
    if (!args.inputs[0]) {
        return cb({error: "No valid PSN name given"});
    }
    
    get_psn(args.inputs[0], function(data) {
        return cb(return_nice(data));
    });
});

api.assign("/psn/full/", function(args, cb) {
    if (!args.inputs[0]) {
        return cb({error: "No valid PSN name given"});
    }
    
    get_psn(args.inputs[0], cb);
});

api.assign("/psn/home/", function(args, cb) {
    if (!args.inputs[0]) {
        cb({error: "Missing PSN name!"});
        return;
    }

    get_home_av(args.inputs[0], args.query.force, cb);
});

function get_home_av(username, force, cb) {
    p.get_home_avatar(username, force, function(im) {
        cb({avatar: im});
    });
}

function get_psn(username, cb) {
    cache.get("psnuser:"+username, function(err, d) {
        if (err) {
            return require("../debug").error("Cache error "+err, "mod_psn");
        }
        
        d = JSON.parse(d);
        if (d && d.last_fetch && d.last_fetch >= (new Date()/1000 - fetch_limit)) {
            cb(d);
        } else {
            PSN.profile(username, function(data) {                
                // swap avatar with our local one :)
                if (!data.error) {
                    p.get_avatar(data.avatar, function(a){
                        if (a) {
                            data.avatar = a;
                        }
                        
                        p.get_home_avatar(data.username, false, function(im) {
                            data.home_avatar = im;
                            
                            // set fetch time
                            data.last_fetch = new Date()/1000;
                            
                            cache.set("psnuser:"+username, JSON.stringify(data));
                            cb(data);
                        });
                    });
                } else {
                    cb({error: "User not found"});
                    data.last_fetch = new Date()/1000;
                    cache.set("psnuser:"+username, JSON.stringify(data));
                }
            });
        }
    });
}

function return_nice(data) {
    if (!data) return {error: "No such user"};
    if (data.error) return {error: "No such user"};
    return {
        username: data.username,
        avatar  : data.avatar,
        region  : data.region,
        country : data.country
    };
}
