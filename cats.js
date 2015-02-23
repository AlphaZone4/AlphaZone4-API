var item    = require("./item"),
    db      = require("./db"),
    d       = require("./debug");

// ====== Exports ======
exports.get         = get;
exports.get_items   = get_items;
exports.region_home = region_home;
exports.region      = region_data;
exports.regions     = regions;
exports.trail       = fetch_breadcrumb;

// ====== Data Structure Config =======

var fetchers = [
    fetch_children,     // sub-categories
    fetch_breadcrumb,   // this category trail
    fetch_items,        // must be last! outcome depends on fetch_children
];

var _regions = {
    eu: {
        code: "eu",
        home: 1,
        pricer: "price",
        name: "Europe",
        named: "European",
        live: 1
    },
    us: {
        code: "us",
        home: 110,
        pricer: "dollars",
        name: "North America",
        named: "North American",
        live: 1
    },
    jp: {
        code: "jp",
        home: 383,
        pricer: "yen",
        name: "Japan",
        named: "Japanese",
        live: 0
    },
    hk: {
        code: "hk",
        home: 286,
        pricer: "hkdollars",
        name: "Asia",
        named: "Asian",
        live: 0
    }
};

// ====== Main Functions ======

function get(id, mod_access, cb) {
    if (typeof(mod_access) == "function") {
        cb = mod_access;
        mod_access = false;
    }
    
    if (!id) {
        return cb({});
    }
    
    // create data object to return
    var ret = {};
    
    // fetch basic data
    db.query("SELECT * FROM homestore_cats WHERE id = ? AND live = '1' LIMIT 1", [ id ], function(error, rows) {
        if (error) {
            d.error("Error getting main category data for cat "+id, "cats");
            return cb(false);
        }
        
        // check we got any results!
        if (!rows.length) {
            return cb({error: "No such category"});
        }
        
        // fill in basic content
        var result  = rows[0];
        ret.id      = result.id;
        ret.name    = result.name;
        ret.image   = result.icon;
        ret.country = result.zone;
        ret.page    = result.page;
        ret._trail  = result.trail;
        
        // build todo list
        var todo = [];
        for(var ii=0; ii<fetchers.length; ii++) {
            todo.push(fetchers[ii]);
        }
        
        // internal fetch function
        var fetch = function() {
            var method = todo.shift();
            
            if (!method) {
                // done all the methods! :D
                return cb(ret);
            } else {
                method(ret, mod_access, function(d) {
                    if (!d) {
                        // data didn't return :(
                        return cb(false);
                    } else {
                        // merge data together
                        for(var ii in d) {
                            ret[ii] = d[ii];
                        }
                        
                        // queue next tick
                        process.nextTick(fetch);
                    }
                });
            }
        };
        
        // start fetching stuff!
        process.nextTick(fetch);
    }); 
}

function region_home(region) {
    if (!region) return 1;
    
    region = region.toLowerCase();
    
    if (_regions[region] && _regions[region].home) {
        return _regions[region].home;
    }
    return 1;
}

function region_data(region) {
    if (!region) return false;
    
    region = region.toLowerCase();
    
    // edgecase...
    if (region == "na") return _regions.us;
    
    if (_regions[region]) return _regions[region];
    
    return false;
}

function regions() {
    return _regions;
}

function get_items(id, mod_access, cb) {
    if (typeof(mod_access) == "function") {
        cb = mod_access;
        mod_access = false;
    }
    
    var hide_admin = "";
    
    if (!mod_access) {
        hide_admin = " AND `live` = 1";
    }
    
    db.query("SELECT item_id, live FROM homestore_itemlinks WHERE cat_id = ?"+hide_admin+" ORDER BY weight ASC",
    [id], function(err, rows) {
        if (err) {
            d.error("Failed to get category items for category "+id, "cats");
            return cb(false);
        }
        
        var items = [];
        var lives = [];
        for(var ii=0; ii<rows.length; ii++) {
            items.push(rows[ii].item_id);
            
            if (!rows[ii].live) {
                lives.push(rows[ii].item_id);
            }
        }
        
        // we have the data list! pass to item to get the rest of the data!
        item.gets(items, !mod_access, function(d) {
            if (!mod_access) return cb(d);
            
            for(var ii=0; ii<d.length; ii++) {
                for(var jj=0; jj<lives.length; jj++) {
                    if (lives[jj] == d[ii].id) d[ii].hidden = true;
                }
            }
            
            return cb(d);
        });
    });
}

// ====== Fetchers ======

function fetch_children(cat, mod_access, cb) {
    var hide_admin = "";
    
    if (!mod_access) {
        hide_admin = " AND `mod` = 0";
    }
    
    db.query("SELECT * FROM homestore_cats WHERE parent = ? AND live = '1' AND hidden = 0"+hide_admin+" ORDER BY `order`", [cat.id], function(error, rows) {
        if (error) {
            d.error('Error fetching category children: ' + error, "cats");
            return cb(false);
        }
        
        if (!rows.length) {
            // no rows returned? return an empty list then
            return cb({
                cats: []
            });
        } else {
            var cats = [];
            for(var ii=0; ii<rows.length; ii++) {
                var a = {
                    id      : rows[ii].id,
                    name    : rows[ii].name,
                    image   : rows[ii].icon,
                    hidden  : rows[ii].mod == 1 ? true : false
                };
                
                if (rows[ii].link) a.link = rows[ii].link;
                
                cats.push(a);
            }
            return cb({
                cats: cats
            });
        }
    });
}

function fetch_breadcrumb(cat, mod_access, cb) {
    if (cat._trail) {
        // trail already exists? use the cached version instead
        var bread = [];
        
        var t = cat._trail.split(",");
        for (var j=0; j<t.length; j++){
            var tmp = t[j].split("|");
            bread.push({
                id  : tmp[0],
                name: tmp[1]
            });
        }
        
        return cb({breadcrumb: bread});
    }
    
    // fetch breadcrumb using lft/rgt madness
    db.query("SELECT parent.name AS name, " +
            "parent.id AS id " +
        "FROM homestore_cats AS node, " +
            "homestore_cats AS parent " +
        "WHERE " +
            "node.lft BETWEEN parent.lft AND parent.rgt " +
            "AND node.id = ? AND parent.live = '1' " +
        "ORDER BY parent.lft",
    [ cat.id ], function(error, rows) {
        if (error){
            d.error("Failed to get category breadcrumb for category "+cat.id, "cats");
            return cb(false);
        }
        
        // build trail and return
        var bread = [];
        var trail = [];
        for(var i=0; i<rows.length; i++){
            bread.push({id:rows[i].id, name:rows[i].name});
            trail.push(rows[i].id+"|"+rows[i].name);
        }
        
        // cache trail for future use
        db.query("UPDATE homestore_cats SET trail = ? WHERE id = ?", [trail.join(","), cat.id]);
        
        return cb({
            breadcrumb: bread
        });
    });
}

function fetch_items(cat, mod_access, cb) {
    if (!mod_access) mod_access = false;
    
    if (!cat.cats.length) {
        // no sub-cats! cool. Get items.
        get_items(cat.id, mod_access, function(d) {
            if (d) {
                return cb({
                    items: d
                });
            } else {
                // important! otherwise it'll think the items object is valid
                cb(d);
            }
        });
    } else {
        // ok, there are sub-cats, let's get the top item for all our children!
        fetch_top_item(cat, function(d) {
            if (!d) {
                // error... just return an empty set.
                cb({
                    items: []
                });
            } else {
                cb({
                    items: d
                });
            }
        });
    }
}


// psedo fetcher, not called directly
function fetch_top_item(cat, cb) {
    // split depending on if this is a root node or not
    if (cat.parent) {
        db.query("SELECT AVG(vv.vote) AS avg FROM `homestore_itemlinks` AS l, " +
            "`homestore_cats` AS c, " +
            "`homestore_items` AS ii, " +
            "`home_votes` AS vv " +
        "WHERE c.id = l.cat_id AND vv.rating_id = ii.rating AND ii.id = l.item_id AND c.live = '1' AND l.live = 1 AND c.lft > ? AND c.rgt < ?",
        [cat.lft, cat.rgt], function(err, rows){
            if (err) {
                d.error('Error (1) fetching top item for category ' + cat.id + ": " + err);
                return cb([]);
            }
            
            var stat = 0;
            if (rows.length) {
                stat = rows[0].avg;
            }
            if (stat <= 0) stat = 0;
            db.query("SELECT AVG(vv.vote) AS avg, COUNT(vv.vote) AS votes, ii.id AS item_id, ((COUNT(vv.vote)*AVG(vv.vote))+(5*"+stat+"))/(COUNT(vv.vote)+5) AS weight " +
                "FROM `homestore_itemlinks` AS l, " +
                "`homestore_cats` AS c, " +
                "`homestore_items` AS ii, " +
                "`home_votes` AS vv " +
            "WHERE c.id = l.cat_id AND vv.rating_id = ii.rating AND ii.id = l.item_id AND c.live = '1' AND l.live = 1 AND c.lft > ? AND c.rgt < ? " +
            "GROUP BY vv.rating_id " +
            "ORDER BY weight DESC " +
            "LIMIT 1",
            [cat.lft, cat.rgt], function(err, rows){
                if (err) {
                    d.error('Error (2) fetching top item for category ' + cat.id + ": " + err);
                    return cb([]);
                }
                
                if (!rows.length) {
                    cb([]);
                } else {
                    // cool! we have the id of the top item :) fetch it!
                    item.get(rows[0].item_id, cb);
                }
            });
        });
    } else {
        // root category
        db.query("SELECT * FROM homestore_updates WHERE type = ? ORDER BY date DESC", [cat.country], function(err, rows){
            if (err) {
                d.error("Failed fetching latest update for top item calculation ()" + err, "cats");
                return cb([]);
            }
            
            var category_id = rows[0].id;
            db.query("SELECT AVG( vv.vote ) AS avg FROM homestore_updateitems AS l, homestore_items AS ii, home_votes AS vv WHERE update_id = ? AND ii.id = l.item_id AND vv.rating_id = ii.rating", [category_id], function(err, rows){
                if (err) {
                    d.error('Error (1) fetching top item for update ' + category_id + ": " + err);
                    return cb([]);
                }
                
                var stat = 0;
                if (!rows.length) {
                    stat = rows[0].avg;
                }
                if (stat <= 0) stat = 0;
                db.query("SELECT AVG(vv.vote) AS avg, COUNT(vv.vote) AS votes, ii.id AS item_id, ((COUNT(vv.vote)*AVG(vv.vote))+(5*"+stat+"))/(COUNT(vv.vote)+5) AS weight " +
                    "FROM homestore_updateitems as l, " +
                    "homestore_items as ii, " +
                    "home_votes AS vv " +
                "WHERE update_id = ? AND ii.id = l.item_id AND vv.rating_id = ii.rating " +
                "GROUP BY vv.rating_id " +
                "ORDER BY weight DESC " +
                "LIMIT 1", 
                [category_id], function(err, rows){
                    if (err) {
                        d.error('Error (2) fetching top item for update ' + category_id + ": " + err);
                        return cb([]);
                    }
                    
                    if (!rows.length) {
                        return cb([]);
                    } else {
                        item.get(rows[0].item_id, cb);
                    }
                });
            });
        });
    }
}
