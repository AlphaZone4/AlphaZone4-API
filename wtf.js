// generates list of WTF items

var cats = require("./cats"),
    item = require("./item"),
    db   = require("./db"),
    d    = require("./debug");

exports.get = get;

function get(limit, start, cb) {
    if (typeof(limit) == "function") {
        cb = limit;
        limit = 1000;
        start = 0;
    } else if (typeof(start) == "function") {
        cb = start;
        start = 0;
    }
    
    // make query
    db.query("SELECT i.* " +
    "FROM `homestore_items` AS i " +
        "JOIN `homestore_wtf` AS w ON i.code = w.code " +
    "WHERE w.crap = '0' AND w.dead = '0'" +
    "ORDER BY w.id DESC " +
    "LIMIT ?,?",
    [start, limit], function(err, rows){
        if (err) {
            d.error("SQL error getting WTF items "+err, "wtf");
            return cb({error: "Internal error"});
        }

        item.gets_data(rows, function(is) {
            return cb(is);
        });
        return;
        var res = [];
        for(var ii=0; ii<rows.length; ii++) {
            var temp = item.get_basic(rows[ii]);
            temp.cold_load = true;
            res.push(temp);
        }
        
        return cb(res);
    });
    return false;
}
