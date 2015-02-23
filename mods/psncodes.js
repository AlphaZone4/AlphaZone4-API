// PSN Code API functions
var codes   = require("../psncodes"),
    db      = require("../db"),
    cache   = require("../cache"),
    api     = require("../api"),
    auth    = require("../auth"),
    moment  = require('moment');

// ======== code =========

// add some functions to the API
api.assign("/get/codes", function(args, cb) {
    cache.get("active_codes", function(e, data) {
        if (data) {
            return cb(JSON.parse(data));
        }
        
        db.query("SELECT * FROM db_codes WHERE end < 2010-01-01 AND start > 2010-01-01 ORDER BY start DESC", function(e, rows) {
            var codes = {eu: [], us: [], jp: [], hk: []};
            
            for(var ii=0; ii<rows.length; ii++) {
                // check end this is valid
                var active = true;
                if (moment(rows[ii].end).isValid()) {
                    active = false;
                }
                
                codes[ rows[ii].region ].push({
                    code: rows[ii].code,
                    name: rows[ii].name,
                    updated: moment(rows[ii].updated).format("YYYY-MM-DD"),
                    start: moment(rows[ii].start).format("YYYY-MM-DD"),
                    active: active
                });
            }
            
            cache.cache("active_codes", JSON.stringify(codes));
            
            return cb(codes);
        });
    });
});

api.assign("/admin/add/code/", function(args, cb) {
    // first, get user ID
    auth.getUserId(args, function(user_id) {
        if (!user_id) return cb({error: "Not authorised :("});
        
        if (!args.inputs[0]) return cb({error: "No code supplied"});
        
        auth.userCan(user_id, "install_plugins", function(e) {
            if (!e) {
                return cb({error: "Unauthorized!"});
            }
            // cool! I'm an admin.
            // check if we already have this code...
            var code = args.inputs[0].toUpperCase();
            
            db.query("SELECT id, name FROM db_codes WHERE code = ?", [code], function(e, rows) {
                if (rows.length) {
                    return cb({error: "Already exists as ID "+rows[0].id}+" ("+rows[0].name+")");
                }
                
                // not already in database, perform a search
                codes.search(args.inputs[0], function(obj) {
                    if (!obj) {
                        return cb({error: "Failed to locate item in any region. Is the code valid?"});
                    }

                    if (obj.error) {
                        return cb(obj);
                    }

                    var name = [];
                    for(var i=0; i<obj.items.length; i++) {
                        name.push(obj.items[i].name);
                    }
                    
                    db.query("INSERT INTO db_codes (`name`, `code`, `region`, `start`, `updated`, `end`) VALUES (?, ?, ?, NOW(), NOW(), '0000-00-00 00:00:00')", [
                        name.join("<br />"),
                        obj.code,
                        obj.region.toLowerCase()
                    ], function(e) {
                        //if (!e) {
                        //    return cb({error: "Failed to add new code - "+e});
                        //}
                        
                        return cb(obj);
                    });
                });
            });
            
            
        });
    });
});
