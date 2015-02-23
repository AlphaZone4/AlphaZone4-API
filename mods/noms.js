// temporary nominations sending module

var db      = require("../db"),
    api     = require("../api"),
    d       = require("../debug");

api.assign("expo5/draw", function(args, cb) {
    var ip = args.headers['x-real-ip'] ? args.headers['x-real-ip'] : "";
    var ref = (args.headers.referer) ? args.headers.referer : "";
    var useragent = args.headers['user-agent'];
    
    if (!useragent) return cb(false);
    
    if (!args.inputs[0]) return cb(false);
    
    db.query("INSERT INTO expo5_bear (`user`, `ip`, `ref`, `useragent`) VALUES (?, ?, ?, ?)", [args.inputs[0], ip, ref, useragent], function(err) {
        if (err) {
            d.error("Failed to submit draw entry. "+err, "noms");
            return cb(false);
        }
        
        return cb(true);
    });
});

api.assign("awards5/vote", function(args, cb) {
    // try and parse this object!
    var j;
    try {
        j = JSON.parse(args.query['votes']);
    } catch (e) {
        return cb({error: "Invalid JSON object sent"});
    }
    
    if (j.votes) {
        var todo = [];
        // loop through types
        for(var type in j.votes) {
            if (j.votes[type]) {
                todo.push([j.votes[type], type, j.user, args.headers['x-real-ip'] ? args.headers['x-real-ip'] : "", j.region, args.headers.referer]);
            }
        }
        
        var insert = function() {
            var p = todo.shift();
            
            if (p) {
                record_nom(p, function(e) {
                    if (!e) {
                        return cb({error: "Failed to send vote. The administrator has been notified and will ensure your submission is successful."});
                    }
                    
                    process.nextTick(insert);
                });
            } else {
                return cb({success: "Thank you for voting!"});
            }
        };
        
        process.nextTick(insert);
    } else {
        return cb({error: "Invalid JSON object sent"});
    }
});

function record_nom(p, cb) {
    // blank submission? Just return true.
    if (!p[0]) return cb(true);
    if (!p[5]) p[5] = "";
    db.query("INSERT INTO awards_5_votes (`vote`, `type`, `user`, `ip`, `region`, `ref`) VALUES (?, ?, ?, ?, ?, ?)", [p[0], p[1], p[2], p[3], p[4], p[5]], function(err) {
        if (err) {
            d.error("Failed to submit vote. "+err, "noms");
            d.error(JSON.stringify(p, null, 2), "noms");
            return cb(false);
        }
        
        return cb(true);
    });
}
