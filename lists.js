var db = require("./db"),
    item = require("./item");

exports.user_get = get_user_lists;
exports.get = get_list_from_hash;

function get_user_lists(user_id, cb) {
    db.query("SELECT name, description, hash, public, owner, date, weight FROM db_lists WHERE owner = ? ORDER BY weight ASC", [user_id], function(err, rows) {
        return cb(rows);
    });
}

function get_list_from_id(list_id, cb) {
    get_list_from_key("id", list_id, cb);
}

function get_list_from_hash(list_id, cb) {
    get_list_from_key("hash", list_id, cb);
}

function get_list_from_key(key, value, cb) {
    db.query("SELECT * FROM db_lists WHERE "+key+" = ?", [value], function(err, rows) {
        if (rows.length) {
            
            var list = rows[0];
            
            db.query("SELECT item_id FROM db_list_items WHERE list_id = ?", [list.id], function(err, rows) {
                if (rows.length) {
                    var items = [];
                    
                    for(var i=0; i<rows.length; i++) {
                        items.push(rows[i].item_id);
                    }
                    
                    item.gets(items, function(d) {
                        list.items = d;
                        
                        return cb(list);
                    });
                } else {
                    list.items = [];
                    
                    return cb(list);
                }
            });
        } else {
            return cb({error: "No such list"});
        }
    });
}

if (!module.parent) {
    get_list_from_id(1, function(a) {
        console.log(a);
    });
}