var db = require("./db"),
    fs = require("fs"),
    dl = require("./dl"),
    item = require("./item"),
    ent = require('ent');

var dir = "/home/cubehouse/sites/cdn/sdat/";

exports.fetch_update = fetch;
exports.edit         = sdat_update;
exports.find         = find_file;
exports.tnum_string  = numToTnum;

function fetch(update, cb) {
    // fetch all items in update (and possible merges)
    db.query("SELECT a.*, i.code AS merge_code, i.tnum AS merge_tnum FROM "+
        "(SELECT i.id, i.code, i.tnum FROM homestore_items AS i, homestore_updateitems AS u WHERE u.update_id = ? AND u.item_id = i.id AND i.tnum >= 0) AS a "+
        "LEFT JOIN homestore_merge AS m ON m.item = a.id "+
        "LEFT JOIN homestore_items AS i ON i.code = m.code",
        [update], function(er, rows) {
        var todo = [];
        
        var list = {};
        
        for(var ii=0; ii<rows.length; ii++) {
            if (!fs.existsSync(dir+rows[ii]['code'][0])) {
                // make folder!
                fs.mkdirSync(dir+rows[ii]['code'][0]);
            }
            
            var f = dir+rows[ii]['code'][0]+"/"+rows[ii]['code']+".sdat";
            if (!fs.existsSync(f)) {
                todo.push({
                    id  : rows[ii].id,
                    code: rows[ii]['code'],
                    tnum: rows[ii]['tnum']
                });
            } else {
                // already downloaded, add to array anyway for processing
                if (!list[ rows[ii]['id'] ]) {
                    list[ rows[ii]['id'] ] = {};
                }
                
                var loc_url = localURL(rows[ii]['code']);
                
                var found = false;
                for(var jj in list[ rows[ii]['id'] ]) {
                    if (rows[ii]['code'] == jj) found = true;
                }
                
                if (!found) {
                    list[ rows[ii]['id'] ][ rows[ii]['code'] ] = loc_url;
                }
            }
            
            if (rows[ii]['merge_code']) {
                var f = dir+rows[ii]['merge_code'][0]+"/"+rows[ii]['merge_code']+".sdat";
                if (!fs.existsSync(f)) {
                    todo.push({
                        id  : rows[ii].id,
                        code: rows[ii]['merge_code'],
                        tnum: rows[ii]['merge_tnum']
                    });
                } else {
                    // already downloaded, add to array anyway for processing
                    if (!list[ rows[ii]['id'] ]) {
                        list[ rows[ii]['id'] ] = {};
                    }
                    
                    var loc_url = localURL(rows[ii]['merge_code']);
                    
                    var found = false;
                    for(var jj in list[ rows[ii]['id'] ]) {
                        if (rows[ii]['merge_code'] == jj) found = true;
                    }
                    
                    if (!found) {
                        list[ rows[ii]['id'] ][ rows[ii]['merge_code'] ] = loc_url;
                    }
                }
            }
        }
        
        if (!todo.length) {
            return cb(list);
        }
        
        var step = function() {
            var c = todo.shift();
            
            if (!c) {
                return cb(list);
            }
            
            downl(c.code, c.tnum, function(e) {
                if (e) {
                    if (!list[ c.id ]) {
                        list[ c.id ] = [];
                    }
                    
                    list[ c.id ][ c.code ] = localURL(c.code);
                }
                
                process.nextTick(step);
            });
        };
        
        process.nextTick(step);
    });
}

function downl(code, tnum, cb) {
    var file = dir+code[0]+"/"+code+".sdat";
    var url = remoteURL(code, tnum);
    dl.download_exist(url, function(e) {
        if (e) {
            dl.download(url, file, function() {
                if (cb) cb(localURL(code));
            });
        } else {
            if (cb) cb(false);
        }
    });
}

function remoteURL(code, tnum) {
    if (tnum === 0) {
        return config.scee_root+"Objects/"+code+"/object.sdat";
    }
    
    return config.scee_root+"Objects/"+code+"/object"+numToTnum(tnum)+".sdat";
}

function localURL(code) {
    return "http://cdn.alphazone4.com/sdat/"+code[0]+"/"+code+".sdat";
}

function numToTnum(n) {
    if (n == 0) return "";
    if (n < 10) return "_T00"+n;
    if (n < 100) return "_T0"+n;
    return "_T"+n;
}

// valid fields for updating
//  POST data -> homestore_items field
var valid_things = {
    name: "name",
    desc: "description",
    type: "type",
    dev : "dev",
    gender: "gender",
};

var valid_fields = [];
for(var ii in valid_things) valid_fields.push(valid_things[ ii ]);

function sdat_update(id, data, cb) {
    db.query("SELECT id, "+valid_fields.join(", ")+" FROM homestore_items WHERE id = ?", [id], function(err, rows) {
        if (!rows[0]) return cb({error: "No such item ID "+id+" :("});
        
        var result = ["Updating item ID: "+rows[0].id+"..."];
        
        var up = {};
        
        for (var ii in valid_things) {
            try { 
                data[ ii ] = ent.decode(data[ ii ]);
            } catch(e) {}
            if (data[ ii ]) {
                if (rows[0][ valid_things[ ii ] ] != data[ ii ]) {
                    up[ valid_things[ ii ] ] = data[ ii ];
                    if (!rows[0][ valid_things[ ii ] ]) {
                        result.push("Adding "+ii+": "+data[ ii ]);
                    } else {
                        result.push("Updating "+ii+": "+rows[0][ valid_things[ ii ] ]+" -to- "+data[ ii ]);
                    }
                }
            }
        }
        
        var fields = [];
        var values = [];
        for(var ii in up) {
            fields.push(ii+"=?");
            values.push(up[ ii ]);
        }
        
        if (!fields.length) {
            result.push("Nothing to change.");
            // set to autocompleted though
            db.query("UPDATE homestore_items SET autocompleted = 1 WHERE id = ?", [id]);
            return cb(result);
            //return cb([code+": Nothing to update! :)"]);
        }
        
        values.push(id);
        
        db.query("UPDATE homestore_items SET "+fields.join(", ")+", autocompleted = 1 WHERE id = ?", values, function(err, rows) {
            if (err) {
                return cb({error: err});
            }
            
            if (rows.affectedRows) {
                result.push("Updated item data in database");
            }
            
            cb(result);
            
            // refetch and recache item
            item.get(id, false, function() {});
            
            return;
        });
    });
}

function find_file(id, cb) {
    // first sort out item ID
    item.merge(id, function(id) {
        db.query("SELECT code, tnum FROM homestore_items WHERE id = ?", [id], function(err, rows) {
            if (err) {
                console.log(err);
                return cb({error: err});
            }

            console.log(rows);
            
            if (rows.length) {
                // get list of merged items (if any exist)
                db.query("SELECT i.code, i.tnum FROM homestore_merge AS m, homestore_items AS i WHERE m.item = ? AND i.code = m.code", [id], function(err, merges) {
                    if (err) {
                        return console.log(err);
                    }
                    
                    var todo = [];
                    
                    todo.push({
                        code: rows[0].code,
                        tnum: rows[0].tnum,
                        file: rows[0].code[0]+"/"+rows[0].code+".sdat"
                    });
                    
                    for (var ii=0; ii<merges.length; ii++) {
                        todo.push({
                            code: merges[ii].code,
                            tnum: merges[ii].tnum,
                            file: merges[ii].code[0]+"/"+merges[ii].code+".sdat"
                        });
                    }
                    
                    var result = [];
                    
                    var step = function() {
                        var c = todo.shift();
                        
                        if (!c) {
                            return cb({
                                id: id,
                                files: result
                            });
                        }
                        
                        fs.exists(dir+c.file, function(e) {
                            if (e) {
                                result.push(localURL(c.code));
                                process.nextTick(step);
                            } else {
                                downl(c.code, c.tnum, function(e) {
                                    if (e) {
                                        result.push(e);
                                        process.nextTick(step);
                                    } else {
                                        return cb({error: "Could not download."});
                                    }
                                });
                            }
                        });
                    };
                    
                    process.nextTick(step);
                });
            } else {
                return cb({error: "Not in database or tnum not stored"});
            }
        });
    });
}

/*fetch(20, function(d) {
   console.log(d);
   
   process.exit(1);
});*/
