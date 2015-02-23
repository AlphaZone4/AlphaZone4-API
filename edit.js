// Item Database edit functions etc.
var db   = require("./db"),
    cats = require("./cats"),
    fs   = require("fs"),
    d    = require("./debug"),
    conf = require("./config"),
    prices = require("./prices"),
    item = require("./item"),
    auth = require("./auth");

exports.add_items = add_items;
exports.add_cat   = add_cat;
exports.reorder   = reorder_cat;
exports.admin_edit = admin_edit;
exports.moderated_edit = user_edit;
exports.admin_edit_multi = admin_edit_multi;
exports.page      = edit_page;

// add items to a category
function add_items(cat_id, items, top, admin_approved, user_id, cb) {
    if (!cat_id) return cb({error: "No category supplied"});
    
    if (!items || !items.length) return cb({error: "No items supplied"});
    
    if (typeof admin_approved == "function") {
        cb = admin_approved;
        admin_approved = false;
    }
    
    // make top optional
    if (typeof top == "function") {
        cb = top;
        top = true;
    }
    
    if (typeof top == "undefined") top = true;
    
    // first find out if this category has children
    cats.get(cat_id, true, function(cat) {
        if (cat.cats.length === 0) {
            // add items to the start of the list
            if (top) {
                // shift all items along
                db.query("UPDATE homestore_itemlinks SET weight = weight + ? WHERE cat_id = ?", [items.length, cat_id], function(err) {
                    if (err) {
                        d.error("Failed to shift items to add new ones (top) ", "Edit");
                        d.error(err, "Edit");
                        return cb({error: "Failed to shift items to add new ones"});
                    }
                    
                    _inject_items(cat_id, items, 0, admin_approved, user_id, cb);
                });
            } else {
                // bottom post!
                _inject_items(cat_id, items, cat.items.length, admin_approved, user_id, cb);
            }
        } else {
            return cb({error: "Cannot add items to category that already has child categories listed."});
        }
    });
}

// starting from 'start', inject items into cat_id
function _inject_items(cat_id, items, start, admin_approved, user_id, cb) {
    var todo = [];
    for(var ii=0; ii<items.length; ii++) {
        todo.push(items[ii]);
    }

    // work out target zone
    db.query("SELECT zone FROM homestore_cats WHERE id = ?", [cat_id], function(err, rows) {
        if (err) {
            return cb({error: err});
        }

        var zone = rows[0].zone;

        function step() {
            var c = todo.shift();
            
            if (!c) {
                // done!
                return cb({success: "Added "+items.length+" new items to category id "+cat_id});
            } else {
                db.query("INSERT IGNORE INTO homestore_itemlinks (`cat_id`, `item_id`, `weight`, `live`, `user_id`, `type`) VALUES (?, ?, ?, ?, ?, ?)", [cat_id, c, start, admin_approved ? 1 : 0, user_id, zone], function(err) {
                    if (err) {
                        d.error("Failed to insert item into category.", "Edit");
                        d.error(err, "Edit");
                        return cb({error: "Failed to add new items"});
                    }
                    
                    start += 1;
                    
                    process.nextTick(step);
                });
            }
        }
        
        process.nextTick(step);
    });
}

// category adding
function add_cat(parent, name, icon, admin_approved, cb) {
    if (!parent || !name || !icon) return cb({error: "Missing required category data"});
    
    if (typeof(admin_approved) == "function") {
        cb = admin_approved;
        admin_approved = false;
    }
    
    icon = require("path").basename(icon);
    
    // check icon existance
    if (!fs.existsSync(conf.cdn_root+"/c/"+icon)) {
        return cb({error: "Icon doesn't exist"});
    }
    
    // check parent category
    db.query("SELECT id, lft, rgt, zone FROM homestore_cats WHERE id = ? AND live = '1' LIMIT 1", [ parent ], function(err, rows) {
        if (err) {
            return cb({error: "Error fetching parent category - " + err});
        }
        
        if (rows.length === 0) {
            return cb({error: "No such parent category"});
        }
        
        var parent_data = rows[0];
        
        // shift all category left/right values
        db.query("UPDATE homestore_cats SET lft = lft + 2, rgt = rgt + 2 WHERE lft > ? AND live = '1'", [ parent_data.lft ], function(err) {
            if (err) {
                return cb({error: "Error updaing cat lft/rgt values - " + err});
            }
            
            // parent category needs to shift up 2 in rgt as well
            db.query("UPDATE homestore_cats SET rgt = rgt + 2 WHERE id = ?", [ parent_data.id ], function(err) {
                if (err) {
                    return cb({error: "Error updating parent rgt value - " + err});
                }
            
                // update category orders that share the same parent
                db.query("UPDATE homestore_cats SET `order` = `order` + 1 WHERE parent = ? AND live = '1'", [ parent ], function(err) {
                    if (err) {
                        return cb({error: "Error updating parent order - " + err});
                    }
                    
                    // add category to database
                    db.query("INSERT INTO homestore_cats (`name`, `icon`, `parent`, `order`, `live`, `zone`, `lft`, `rgt`, `mod`) VALUES (?, ?, ?, 0, '1', ?, ?, ?, ?)",
                    [ name, icon, parent, parent_data.zone, parent_data.lft + 1, parent_data.lft + 2, admin_approved ? 0 : 1 ],
                    function(err, result) {
                        if (err) {
                            return cb({error: "Failed to insert new category - "+err});
                        }
                        
                        return cb({success: "Successfully created new category "+name+" - ID "+result.insertId, id: result.insertId});
                    });
                });
            });
        });
    });
}

function reorder_cat(cat_id, order, cb) {
    // fetch live category data first
    cats.get(cat_id, true, function(cat) {
        var table;
        var sorter;
        var where;
        var args = [];
        
        var ii;
        
        // work out what we're re-ordering
        if (cat.cats.length === 0) {
            // items! yay!

            // make sure list of items matches live data
            for(var i=0; i<cat.items.length; i++) {
                var found = false;
                for(var j=0; j<order.length; j++) {
                    if (order[j] == cat.items[i].id) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    // item not in live list?!?!
                    return cb({error: "Invalid item in list"});
                }
            }
            
            table = "`homestore_itemlinks`";
            sorter = "`weight`";
            where = "`cat_id` = ? AND `item_id` = ?";
            
            for(ii=0; ii<order.length; ii++) {
                args.push([
                    ii,
                    cat_id,
                    order[ii]
                ]);
            }
        } else {
            // categories! yay!
            
            table = "`homestore_cats`";
            sorter = "`order`";
            where = "`parent` = ? AND `id` = ?";
            
            for(ii=0; ii<order.length; ii++) {
                args.push([
                    ii,
                    cat_id,
                    order[ii]
                ]);
            }
        }
        
        var step = function() {
            var n = args.shift();
            
            if (!n) {
                // done!
                return cb({success: "Updated order"});
            } else {
                db.query("UPDATE "+table+" SET "+sorter+"=? WHERE "+where, n, function(err) {
                    if (err) {
                        return cb({error: err});
                    }
                    
                    process.nextTick(step);
                });
            }
        };
        
        // start updating order values
        process.nextTick(step);
    });
}


var editable_fields = [
    "name", "description", "gender", "tutorial", "type", "dev", "slots"
];
var editable_prices = [
];
var p = prices.fields();
var pricefields = {};
for(var ii in p) {
    editable_fields.push(p[ii]);
    editable_prices.push(p[ii]);
    pricefields[p[ii]] = ii;
}

function admin_edit(item_id, data, cb) {
    var fields = [];
    var values = [];
    
    if (!data) return cb({error: "No data supplied"});
    
    for(var ii=0; ii<editable_fields.length; ii++) {
        if (typeof data[ editable_fields[ ii ] ] != "undefined") {
            fields.push( editable_fields[ ii ] + " = ?" );
            values.push( data[ editable_fields[ ii ] ] );
        }
    }
    
    values.push(item_id);
    
    db.query("UPDATE homestore_items SET "+fields.join(", ")+" WHERE id = ?", values, function(err, succ) {
        if (err) {
            return cb({error: err});
        }
        
        item.get(item_id, false, function(ndat) {
            return cb({success: succ.message, message: "Successfully updated item "+item_id, item: ndat});
        });
    });
}

function admin_edit_multi(items, data, cb) {
    var step = function() {
        var c = items.shift();
        
        if (!c) {
            return cb({success: "Successfully updated items"});
        }
        
        admin_edit(c, data, function() {
            process.nextTick(step);
        });
    };
    
    process.nextTick(step);
}

function user_edit(item_id, data, user_id, ip, cb) {
    if (!data) return cb({error: "No data supplied"});
    
    console.log("Hai "+user_id);
    
    auth.userCan(user_id, "itemdatabase_pricer", function(e) {
        console.log(e);
        
        var doit = function() {
            item.get(item_id, false, function(ndat) {
                var new_data = {};
                
                var count = 0;
                
                for(var ii=0; ii<editable_fields.length; ii++) {
                    if (typeof data[ editable_fields[ ii ] ] != "undefined") {
                        if (pricefields[ editable_fields[ ii ] ]) {
                            // aha! this is a PRICE. THIS IS DIFFERENT :D
                            if (data[ editable_fields[ ii ] ] != ndat.prices[ pricefields[editable_fields[ ii ]] ]) {
                                new_data[ editable_fields[ ii ] ] = data[ editable_fields[ ii ] ].replace(/[^0-9\-\.]/gi, '');
                                count += 1;
                            }
                        } else {
                            if (data[ editable_fields[ ii ] ] != ndat[ editable_fields[ ii ] ]) {
                                //console.log("Change: "+editable_fields[ ii ]+": "+ndat[editable_fields[ ii ]]+" => "+data[editable_fields[ ii ]]);
                                new_data[ editable_fields[ ii ] ] = data[ editable_fields[ ii ] ];
                                count += 1;
                            }
                        }
                    }
                }
                
                if (count > 0) {
                    db.query("INSERT INTO homestore_edits (user_id, item_id, ip, data) VALUES (?, ?, ?, ?)",
                            [user_id, item_id, ip, serialize(new_data)],
                        function(err, succ) {
                        if (err) {
                            return cb({error: err});
                        }
                        
                        return cb({success: "Thank you! Edit for item "+item_id+" has been sent for moderation!", item: ndat});
                    });
                } else {
                    return cb({success: "Thank you! Edit for item "+item_id+" has been sent for moderation!", item: ndat});
                }
            });
        };
        
        if (e) {
            // user has special pricing ability
            //  right... prices...
            item.get(item_id, false, function(ndat) {
                var new_prices = [];
                var new_prices_q = [];
                
                for(var ii=0; ii<editable_prices.length; ii++) {
                    new_prices.push(data[editable_prices[ii]].replace(/[^0-9\-\.]/gi, ''));
                    new_prices_q.push(editable_prices[ii] + " = ?");
                }
                
                // push new prices through, then continue to other edits
                new_prices.push(item_id);
                db.query("UPDATE homestore_items SET "+new_prices_q.join(", ")+" WHERE id = ?", new_prices, function(err) {
                    doit();
                });
            });
        } else {
            doit();
        }
        
    });
}

function edit_page(cat_id, content, cb) {
    db.query("UPDATE homestore_cats SET page = ? WHERE id = ?", [content, cat_id], function(err, rows) {
        if (err) {
            return cb({error: err});
        }
        cb({success: rows.message});
    });
}





function serialize(mixed_value) {
    var _getType = function(inp) {
        var type = typeof inp, match;
        var key;
        if (type == 'object' && !inp) {
            return 'null';
        }
        if (type == "object") {
            if (!inp.constructor) {
                return 'object';
            }
            var cons = inp.constructor.toString();
            match = cons.match(/(\w+)\(/);
            if (match) {
                cons = match[1].toLowerCase();
            }
            var types = ["boolean", "number", "string", "array"];
            for (key in types) {
                if (cons == types[key]) {
                    type = types[key];
                    break;
                }
            }
        }
        return type;
    };
    var type = _getType(mixed_value);
    var val, ktype = '';

    switch (type) {
        case "function":
            val = "";
            break;
        case "null":
        case "undefined":
            val = "N";
            break;
        case "boolean":
            val = "b:" + (mixed_value ? "1" : "0");
            break;
        case "number":
            val = (Math.round(mixed_value) == mixed_value ? "i" : "d") + ":" + mixed_value;
            break;
        case "string":
            val = "s:" + mixed_value.length + ":\"" + mixed_value + "\"";
            break;
        case "array":
        case "object":
            val = "a";
            var count = 0;
            var vals = "";
            var okey;
            var key;
            for (key in mixed_value) {
                ktype = _getType(mixed_value[key]);
                if (ktype == "function") {
                    continue;
                }

                okey = (key.match(/^[0-9]+$/) ? parseInt(key, 10) : key);
                vals += serialize(okey) +
                        serialize(mixed_value[key]);
                count++;
            }
            val += ":" + count + ":{" + vals + "}";
            break;
    }
    if (type != "object" && type != "array") {
        val += ";";
    }
    return val;
}
