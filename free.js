// generates free lists of items for each region

var cats = require("./cats"),
    item = require("./item"),
    db   = require("./db"),
    d    = require("./debug");

exports.get = get;

function get(region, cb) {
    // turn into region object
    region = cats.region(region);
    
    // check it still works
    if (!region) return cb({error: "No region given"});
    
    // create freebie object
    var ret = {
        name: "Free " + region.named + " items",
        items: [],
        country: region.code,
        breadcrumb:[
            {
                name: "Home",
                id: cats.region_home(region.code)
            },
            {
                name: region.named+" Free Store Items"
            }
        ]
    };
    
    // make query
    db.query("SELECT i.*, c.name AS cat_name, c.id AS cat_id " +
    "FROM `homestore_items` AS i " +
        "JOIN `homestore_itemlinks` AS l ON l.item_id = i.id " +
        "JOIN `homestore_cats` AS c ON c.id = l.cat_id " +
    "WHERE c.live = '1' AND l.type = ? AND l.live = 1 AND i." + region.pricer + "=-1 " +
    "GROUP BY i.id " +
    "ORDER BY i.date DESC",
    [region.code], function(err, rows){
        if (err) {
            d.error("SQL error getting free items for "+region.code, "free");
            return cb({error: "Internal error"});
        }
        
        item.gets_data(rows, function(items) {
            ret.items = items;
            
            return cb(ret);
        });
    });
    return false;
}