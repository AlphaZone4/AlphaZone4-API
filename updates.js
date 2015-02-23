var db     = require("./db"),
    d      = require("./debug"),
    cats   = require("./cats"),
    item   = require("./item"),
    moment = require("moment");
    
// ===== Exports ======

exports.get         = get_update; // get full update data (with item info filled in)
exports.items       = get_items;  // get item list from update ID
exports.date        = get_date;   // get full update data for specific date
exports.date_items  = get_date_items;   // get full update data for specific date
exports.update      = get_update_id;    // given a date and region, return update ID
exports.latest      = latest_update;    // get date of latest update

// ====== Main Functions ======

function get_update(id, cb) {
    if (!id) return cb({error: "No update ID given"});
    
    // fetch update information
    db.query("SELECT * FROM homestore_updates WHERE id = ?", [ id ], function(error, rows) {
        if (error){
            cb({error: "Internal error"});
            return d.error("Failed to get update "+id, "updates");
        }
        
        if (!rows.length){
            return cb({error: "No such update ID"});
        }
        
        // build initial object
        var update = {
            id: id,
            name: rows[0].name,
            country: rows[0].type,
            items: [],
            breadcrumb:[
                {
                    name: "Home",
                    id: cats.region_home(rows[0].type)
                },
                {
                    name: rows[0].type+" update for "+rows[0].name
                }
            ]
        };
        
        // fetch item list
        get_items(id, function(items) {
            if (!items) return cb({error: "Internal error fetching update items"});
            
            // fill in item data
            item.gets(items, function(items) {
                update.items = items;
                
                return cb(update);
            });
        });
    });
    return false;
}

// get list of item IDs given update ID
function get_items(id, cb) {
    db.query("SELECT DISTINCT item_id FROM homestore_updateitems WHERE update_id = ? ORDER BY weight, item_id ASC", [id], function(error, rows){
        if (error) {
            d.error("SQL error fetching update items for "+id, "updates");
            return cb({error: "Internal error fetching update items"});
        }
        
        var items = [];
        for(var ii=0; ii<rows.length; ii++) items.push(rows[ii].item_id);
        
        return cb(items);
    });
}

function get_update_id(date, region, cb) {
    // work out update ID
    db.query("SELECT id FROM `homestore_updates` WHERE date > ? AND date < ? + INTERVAL 1 DAY AND type = ?", [date, date, region], function(err, rows) {
        if (err) {
            d.error("Error fetching specific date update. "+err, "updates");
            return cb({error: "Error fetching update by date"});
        }
        
        if (!rows.length) {
            return cb(false);
        }
        
        return cb(rows[0].id);
    });
}

function get_date_items(date, region, cb) {
    get_update_id(date, region, function(id) {
        return get_items(id, cb);
    });
}

function get_date(date, region, cb) {
    get_date_items(date, region, function(i) {
        if (!i) return cb(i);
        
        return item.gets(i, cb);
    });
}

function latest_update() {
    var date;
    
    var today = new Date().getDay();
    
    if (today === 0 || today >= 4) {
        // we're currently Thursday-Sunday
        if (today === 0) {
            date = moment().subtract('days', 4);
        } else {
            date = moment().subtract('days', today - 3);
        }
    } else {
        // we're in the start of the week...
        date = moment().add('days', 3 - today);
    }
    return date.format("YYYY-MM-DD");
}

if (!module.parent) {
    get_date_items("2013-01-09", "EU", function(a) {
        console.log(a);
    });
}