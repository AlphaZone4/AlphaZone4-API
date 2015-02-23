var cache    = require("./cache"),
    d        = require("./debug"),
    settings = require("./config"),
    auth     = require("./auth"),
    db       = require("./db"),
    item     = require("./item"),
    prices   = require("./prices"),
    lists    = require("./lists"),
    cats     = require("./cats");

// ====== Fetchers ======

var fetchers = [
    fetch_basic_settings,
    fetch_user,
    fetch_devs,
    fetch_prices,
    fetch_changes,
    fetch_edit_users
];

var basic_fetchers = [
    function(args, cb){fetch_updates("EU", cb)},
    function(args, cb){fetch_updates("US", cb)},
    function(args, cb){fetch_updates("JP", cb)},
    function(args, cb){fetch_updates("HK", cb)},
    fetch_stats
];

if (!module.parent) {
    get({}, function(data) {
        console.log(data);
    });
}

// ====== Exporters ======

exports.get = get;
exports.devs = devs;

// ====== Main Functions ======

function get(args, cb) {
    // our basic return object
    var ret = {
        api: settings.api_version,
        item_types: item.types_names(),
    };
    
    var todo = [];
    for(var ii=0; ii<fetchers.length; ii++) {
        todo.push(fetchers[ii]);
    }
    
    var fetch = function() {
        var method = todo.shift();
        
        if (method) {
            method(args, function(d) {
                if (d) {
                    for(var ii in d) {
                        ret[ii] = d[ii];
                    }
                    
                    process.nextTick(fetch);
                } else {
                    // :'(
                    return cb(false);
                }
            });
        } else {
            // no method? we're done!
            return cb(ret);
        }
    };
    
    process.nextTick(fetch);
}

function devs(cb) {
    cache.get("devs", function(err, data) {
        if (err) {
            d.error("Failed to use cache to find developers :(", "settings");
            return cb(false);
        }
        
        if (data) {
            // woo! use cache
            cb(JSON.parse(data));
        } else {
            db.query("SELECT id, name, slug FROM db_devs WHERE enabled = '1' ORDER BY name ASC", function(err, rows) {
                if (err) {
                    d.error("SQL error fetching developers. "+err, "settings");
                    return cb(false);
                }
                
                var ret = {};
                var full = {};
                for(var ii=0; ii<rows.length; ii++) {
                    ret[ rows[ii].slug ] = rows[ii].name;
                    full[ rows[ii].id ] = {
                        slug: rows[ii].slug,
                        name: rows[ii].name
                    };
                }
                
                return cb({
                    slugs: ret,
                    list : full
                });
            });
        }
    });
}

// ===== Fetchers =====

function fetch_user(args, cb) {
    var ret = {
        database_admin:     false,
        database_edit:      false,
        database_submit:    false,
        database_mod:       false,
        database_scan:      false,
    };
    
    // find WordPress cookie :)
    var cookies = {};
    if ( (args.headers) && (args.headers.cookie) && (args.headers.cookie.indexOf(";")!=-1) ) {
        args.headers.cookie.split(';').forEach(function( cookie ) {
            var parts = cookie.split('=');
            cookies[ parts[ 0 ].trim() ] = ( parts[ 1 ] || '' ).trim();
        });
    }
    
    if (cookies["wordpress_logged_in_"+settings.cookie]) {
        // user has presented a cookie :D (om nom nom)
        auth.validateCookie(cookies["wordpress_logged_in_"+settings.cookie], function(user) {
            if (!user.id) {
                // not valid cookie
                return cb(ret);
            } else {
                // coolio! valid cookie! let's get some user details then!!!
                var todo = [
                    function(cb){auth.userCan(user, "itemdatabase_admin", function(y){cb({database_admin: y})})},
                    function(cb){auth.userCan(user, "itemdatabase_edit", function(y){cb({database_edit: y})})},
                    function(cb){auth.userCan(user, "itemdatabase_submit", function(y){cb({database_submit: y})})},
                    function(cb){auth.userCan(user, "itemdatabase_mod", function(y){cb({database_mod: y})})},
                    function(cb){auth.userCan(user, "itemdatabase_scan", function(y){cb({database_scan: y})})},
                    function(cb){auth.userCan(user, "itemdatabase_pricer", function(y){cb({database_pricer: y})})},
                    // user lists
                    function(cb) {
                        // get user's lists
                        lists.user_get(user.id, function(lists) {
                            cb({lists: lists});
                        });
                    },
                ];
                
                var fetch = function() {
                    var method = todo.shift();
                    
                    if (!method) {
                        // done! :D
                        return cb(ret);
                    } else {
                        method(function(d) {
                            if (d) {
                                for(var ii in d) {
                                    ret[ii] = d[ii];
                                }
                                
                                process.nextTick(fetch);
                            } else {
                                // submethod failed :(
                                return cb(false);
                            }
                        });
                    }
                };
                
                // callback to lists to fetch user's list of lists
                /*require("./lists.js").user(user.id, function(lists){
                    d.lists = lists;
                    checkSettings();
                });*/
                
                // start fetching user permissions
                process.nextTick(fetch);
            }
        });
    } else {
        // no cookie. how dull.
        return cb(ret);
    }
}

function fetch_basic_settings(args, cb) {
    cache.get("az4settings", function(err, data) {
        if (!data) {
            // basic settings object to return
            var ret = {};
            
            var fetch = function() {
                var m = todo.shift();
                
                if (!m) {
                    // no more methods?!... return!
                    // cache first...
                    cache.cache("az4settings", JSON.stringify(ret));
                    
                    return cb(ret);
                } else {
                    // call next method in the list
                    m(args, function(d) {
                        if (!d) {
                            return cb(false);
                        } else {
                            // data? yay! merge and do next step
                            for (var ii in d) {
                                ret[ii] = d[ii];
                            }
                            
                            process.nextTick(fetch);
                        }
                    });
                }
            };
            
            // fetch basic settings object
            var todo = [];
            for(var ii=0; ii<basic_fetchers.length; ii++) {
                todo.push(basic_fetchers[ii]);
            }
            
            // start fetching stuff
            process.nextTick(fetch);
        } else {
            // found cached version! just return that
            cb(JSON.parse(data));
        }
    });
}

function fetch_updates(region, cb) {
    db.query("SELECT id, name FROM homestore_updates WHERE type=? ORDER BY date DESC LIMIT 5", [region], function(err, rows){
        if (err) {
            d.error("SQL fail on region updates for "+region, "settings");
            return cb(false);
        }
        
        // return new updates
        var ret = {};
        ret[region.toLowerCase() + "updates"] = rows;
        cb(ret);
    });
}

function fetch_stats(args, cb) {
    var ret = {};
    
    // make todo list
    var todo = [
        function(_cb){fetch_stat("EU", _cb)},
        function(_cb){fetch_stat("US", _cb)},
        function(_cb){fetch_stat("JP", _cb)},
        function(_cb){fetch_stat("HK", _cb)},
        function(_cb){fetch_stat("global", _cb)},
        fetch_update_stats
    ];
    
    var fetch = function() {
        var method = todo.shift();
        
        if (method) {
            method(function(d) {
                if (d) {
                    // yay! data! merge in
                    for(var ii in d) {
                        ret[ii] = d[ii];
                    }
                    
                    // do next tick
                    process.nextTick(fetch);
                } else {
                    // :(
                    return cb(false);
                }
            });
        } else {
            // we're done!
            return cb(ret);
        }
    };
    
    process.nextTick(fetch);
}

function fetch_stat(region, cb) {
    var from = "homestore_items";
    if (region!="global") {
        from = "(SELECT DISTINCT i.id, gender FROM homestore_items AS i, homestore_itemlinks AS l, homestore_cats AS c WHERE l.live = 1 AND c.live = '1' AND l.cat_id = c.id AND i.id = l.item_id AND l.type = '"+region+"' AND gender != '') as t";
    }
    // get gender count
    db.query("SELECT COUNT(gender) AS n, gender FROM "+from+" GROUP BY gender", function(error, rows) {
        var d= {};
        for(var i=0; i<rows.length; i++){
            if (rows[i].gender=="M"){
                d.m = rows[i].n;
            }else{
                d.f = rows[i].n;
            }
        }
        
        // item count
        if (region!="global") {
            db.query("SELECT COUNT(DISTINCT i.id) AS n FROM homestore_items AS i, homestore_itemlinks AS l, homestore_cats AS c WHERE l.live = 1 AND c.live = '1' AND l.cat_id = c.id AND i.id = l.item_id AND l.type = ?", [region], function(error, rows){
                d.tot = rows[0].n;
                
                var ret = {};
                ret[region] = d;
                cb(ret);
            });
        } else {
            db.query("SELECT COUNT(id) as count FROM homestore_items", function(error, rows){
                d.tot = rows[0].count;
                cb({
                    global: d
                });
            });
        }
    });
};

function fetch_devs(args, cb) {
    devs(function(d) {
        if (d) {
            cb({
                devs: d.slugs
            });
        } else {
            return cb(false);
        }
    });
}

function fetch_update_stats(cb) {
    db.query("SELECT COUNT(1) AS num FROM homestore_updates", function(e, rows) {
        return cb({update_count: rows[0].num});
    });
}

function fetch_prices(args, cb) {
    return cb({
        prices: prices.settings()
    });
}

function fetch_changes(args, cb) {
    db.query("SELECT "+
        "u.display_name AS username, DATE_FORMAT(l.time, '%D %M %Y') AS day, l.cat_id, c.name AS cat_name, c.zone AS region, COUNT(1) AS items, c.trail AS _trail "+
        "FROM `homestore_itemlinks` AS l "+
        "LEFT JOIN `homestore_cats` AS c ON c.id = l.cat_id "+
        "LEFT JOIN `az4_users` AS u ON u.id = l.user_id "+
        "WHERE l.live = '1' AND l.user_id > 0 "+
        "GROUP BY l.user_id, DATE(l.time), l.cat_id "+
        "ORDER BY time DESC "+
        "LIMIT 50",
        function(err, rows) {
            var todo = [];
            for(var i=0; i<rows.length; i++) {
                todo.push(rows[i]);
            }
    
            var result = [];

            var step = function() {
                var c = todo.shift();
                if (c) {
                    // grab trail
                    cats.trail(c, false, function(res) {
                        var bits = res.breadcrumb;
                        var h = [];
                        var rewarder = false;
                        for(var i=0; i<bits.length; i++) {
                            if (bits[i].id == 97 || bits[i].id == 358) {
                                rewarder = true;
                            } else if (rewarder) {
                                h.push(bits[i].name);
                            }
                        }
                        if (rewarder) {
                            c.reward_type = h.shift();
                            c.trail = h.join(" / ");
                            delete c._trail;
                            result.push(c);
                        }
                        process.nextTick(step);
                    });
                } else {
                    // done!
                    return cb({changes: result});
                }
            };

            process.nextTick(step);
        }
    );
}

function fetch_edit_users(args, cb) {
    db.query(
        "SELECT u.* FROM az4_usermeta AS m LEFT JOIN az4_users AS u ON u.ID = m.user_id WHERE m.meta_key = 'az4_capabilities' AND (m.meta_value LIKE '%\"dbmaintainer\"%' OR m.meta_value LIKE '%\"scanner\"%' OR m.meta_value LIKE '%\"scannerapproved\"%') GROUP BY u.ID",
        function(err, rows) {
            console.log(err);
            var users = [];
            for(var i=0; i<rows.length; i++) {
                users.push({
                    name: rows[i].display_name,
                    value: rows[i].ID
                });
            }
            return cb({edit_users: users});
        }
    );
}
