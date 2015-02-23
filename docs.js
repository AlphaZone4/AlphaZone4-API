// wrapper for etherpad-list-client

var api     = require('etherpad-lite-client'),
    conf    = require("./config"),
    d       = require("./debug"),
    updates = require("./updates"),
    item    = require("./item"),
    db      = require("./db"),
    cats    = require("./cats");

// exports
exports.update          = get_update;
exports.apply           = check_updates;
exports.apply_region    = check_update;
exports.fetch           = fetch_pad;
exports.fetch_group     = fetch_group_pad;
exports.items           = items_only;

// logic!

var epad;

if (conf.docs) {
    epad = api.connect({
        apikey  :conf.docs.api_key,
        host    :conf.docs.host,
        port    :conf.docs.port
    });
}

// API calls

function fetch_pad(id, cb) {
    epad.getText({
        padID: id
    }, function(err, data) {
        if (err) {
            return cb(false);
        }
        
        return cb(data.text);
    });
}

function fetch_group_pad(id, cb) {
    fetch_pad("g."+conf.docs.group+"$"+id, cb);
}

// itemdb calls

// date must be in YYYY-MM-DD format (or not supplied for latest update)
function get_update(region, date, cb) {
    if (!cb) {
        cb = date;
        date = updates.latest();
    }
    
    if (!date) date = updates.latest();
    
    region = region.toUpperCase();
    
    fetch_group_pad(date+"_"+region, function(data) {
        if (!data) return cb(data);
        
        return cb(items_only(data));
    });
}

// helpers

var regex_item = /^([0-9]*)/;
function items_only(input) {
    var items = [];
    
    input = input.split("\n");
    
    for(var ii=0; ii<input.length; ii++) {
        var e = input[ii].match(regex_item);
        if (e && e[1]) {
            items.push(e[1]);
        }
    }
    
    return items;
}

// update functions
function check_updates(date, cb) {
    if (!cb) {
        cb   = date;
        date = null;
    }
    
    // get region list from cats module
    var reg  = cats.regions();
    var todo = [];
    var ret  = {}; // return object
    
    // build todo list
    for(var r in reg) {
        if (reg[r].live) {
            todo.push(r);
        }
    }
    
    // update each region in turn and return mega object!
    var fetcher = function() {
        var n = todo.shift();
        
        if (!n) {
            return cb(ret);
        } else {
            check_update(n, date, function(data) {
                ret[ n ] = data;
                
                process.nextTick(fetcher);
            });
        }
    };
    
    process.nextTick(fetcher);
}

// check a region's update file against the database
function check_update(region, date, cb) {
    // optional date argument
    if (!cb) {
        cb = date;
        date = null;
    }
    
    // fetch latest date if not specified
    if (!date) date = updates.latest();
    
    // first, fetch docs list for latest update
    get_update(region, date, function(items_docs) {
        if (!items_docs) return cb({error: "Error fetching update from docs"});
        
        // fix items_docs merges
        item.merges(items_docs, function(items_docs) {
            if (!items_docs) return cb({error: "Error merging items from docs"});
            
            // then fetch update list from database
            updates.update(date, region, function(id) {
                if (!id) return cb({error: "Error fetching update ID from db"});
                
                updates.items(id, function(items_db) {
                    if (!items_db) return cb({error: "Error fetching update from db"});
                    
                    // compare results
                    var moves = []; // list of item weights to be updated
                    var news  = []; // list of new items
                    var rem   = []; // list of items to delete
                    
                    // first, compare doc to database
                    for(var ii=0; ii<items_docs.length; ii++) {
                        var found = false;
                        
                        if (items_db[ii] == items_docs[ii]) {
                            // it's where it should be! :D
                            found = true;
                        } else {
                            // drat! not where it should be. Hunt it down!
                            for(var jj=0; jj<items_db.length; jj++) {
                                if (items_db[jj] == items_docs[ii]) {
                                    // mark as found
                                    found = true;
                                    
                                    // store item's new weight
                                    moves.push({
                                        item_id: items_db[jj],
                                        weight : ii
                                    });
                                }
                            }
                        }
                        
                        if (!found) {
                            // item not yet in database! add it!
                            news.push({
                                item_id: items_docs[ii],
                                weight : ii
                            });
                        }
                    }
                    
                    // then check db against docs
                    for(var ii=0; ii<items_db.length; ii++) {
                        var found = false;
                        
                        for(var jj=0; jj<items_docs.length; jj++) {
                            if (items_db[ii] == items_docs[jj]) {
                                found = true;
                            }
                        }
                        
                        if (!found) {
                            // this item exists in the database, but not the doc! delete!
                            rem.push(items_db[ii]);
                        }
                    }
                    
                    var ret = {
                        items_new: [],
                        items_old: []
                    };
                    
                    // update database
                    var move = function() {
                        var r = moves.shift();
                        
                        if (!r) {
                            process.nextTick(_new);
                        } else {
                            db.query("UPDATE homestore_updateitems SET weight = ? WHERE item_id = ? AND update_id = ?",
                            [r.weight, r.item_id, id],
                            function(e) {
                                if (e) return d.error("Failed to update updateitems. "+JSON.stringify(e), "docs");
                                
                                // yay! updated! do the next one!
                                process.nextTick(move);
                            });
                        }
                    };
                    
                    var _new = function() {
                        var r = news.shift();
                        
                        if (!r) {
                            process.nextTick(remove);
                        } else {
                            db.query("INSERT INTO homestore_updateitems (`weight`, `item_id`, `update_id`) VALUES (?, ?, ?)",
                            [r.weight, r.item_id, id],
                            function(e) {
                                if (e) return d.error("Failed to insert new row into updateitems. "+JSON.stringify(e), "docs");
                                
                                ret.items_new.push(r.item_id);
                                
                                // yay! updated! do the next one!
                                process.nextTick(_new);
                            });
                        }
                    };
                    
                    var remove = function() {
                        var r = rem.shift();
                        
                        if (!r) {
                            return cb(ret);
                        } else {
                            db.query("DELETE FROM homestore_updateitems WHERE update_id = ? AND item_id = ?",
                            [id, r],
                            function(e) {
                                if (e) return d.error("Failed to delete row from updateitems. "+JSON.stringify(e), "docs");
                                
                                ret.items_old.push(r);
                                
                                // yay! updated! do the next one!
                                process.nextTick(remove);
                            });
                        }
                    };
                    
                    // start updating moves
                    process.nextTick(move);
                });
            });
        });
    });
}

if (!module.parent) {
    check_updates(function(d) {
        console.log(d);
    });
    /*fetch_group_pad("2013-01-09_EU", function(data) {
        console.log(items_only(data));
    });*/
}