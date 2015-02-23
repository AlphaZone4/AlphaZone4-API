var d       = require("./debug"),
    fs      = require("fs"),
    db      = require("./db"),
    md5     = require("./md5"),
    config  = require("./config"),
    dl      = require("./dl"),
    votes   = require("./vote"),
    prices  = require("./prices"),
    cache   = require("./cache");

// ====== Exports ======

exports.image       = image;
exports.image_large = image_large;
exports.get         = get;
exports.get_basic   = get_basic_data;
exports.gets        = gets;
exports.get_data    = get_data;
exports.gets_data   = gets_data;
exports.types       = types;
exports.types_names = types_names;
exports.download    = download;
exports.merge       = merge;
exports.merges      = merges;
exports.getGUID     = getGUID;

// ====== Data Structure Config =====

// configure functions that fetch addition data for items
var fetchers = [
    fetch_cats,         // item categories
    fetch_image_large,  // whether this item has a large image
    fetch_updates,
];

var _types = [
    '','Chead','Chair','Chands','Ctorso','Clegs','Cfeet','Cjewelry','Cglasses',
    'Cheadphones','Coutfit','Cbundle','FPictureFrame','FChair','FFootstall',
    'FTable','FStorage','FFlooring','FOrnament','FCube','FLight','FSofa',
    'FAppliance','FCompanion','FPortable','Apartment','Clubhouse','Locomotion',
    'Active', 'Animations', "Consumable"
];

var type_names = [
    'None','Head',"Hair",'Hands','Torso','Legs','Feet','Jewelry',
    'Glasses','Headphones','Outfit','Bundle','Picture Frame',
    'Chair','Footstall','Table','Container','Flooring','Ornament',
    'Cube','Light','Sofa','Appliance','Companion','Portable','Apartment',
    'Clubhouse','Locomotion', 'Active Item', 'Animation Pack', "Consumable"
];

var item_prices = prices.fields();

var cache_names;

// ====== Standard functions ======

function image(code) {
    if (code.length<20){
        return "unknown";
    } else {
        return md5.hash(config.hash.pre + code + config.hash.post);
    }
}

function image_large(image, cb) {
    fs.exists(config.cdn_root+"/l/"+image, function(e) {
        cb (e ? true : false);
    });
}

function types() {
    return _types;
}

function types_names() {
    if (_types.length != type_names.length) {
        d.error("Type arrays are different lengths! ("+_types.length+" and "+type_names.length+")", "item");
        return {};
    }
    
    if (!cache_names) {
        cache_names = {};
        for(var ii=0; ii<_types.length; ii++) {
            cache_names[ _types[ii] ] = type_names[ii];
        }
    }
    
    return cache_names;
}

// ====== Main Functions ======

// merge sorter
// goes through array of IDs and fixes and required merges
function merge(id, cb) {
    db.query("SELECT m.item AS merger FROM homestore_items AS i LEFT JOIN homestore_merge AS m ON i.code = m.code WHERE i.id = ?", [id], function(err, rows) {
        if (err) {
            d.error("Failed to fetch item "+id, "item");
            return cb(false);
        }
        
        if (!rows.length) {
            return cb({error: "No such item"});
        }
        
        if (rows[0].merger) {
            // this item is merged! return that one instead
            return cb(rows[0].merger);
        }
        
        // otherwise return original happy item ID
        return cb(id);
    });
}

// merge an array of items
function merges(ids, cb) {
    if (!ids || !ids.length) {
        return cb([]);
    }
    
    // return array
    var items = [];
    
    // fetch each item in turn
    var fetch = function() {
        var id = ids.shift();
        
        if (!id) {
            // we've run out of items to fetch!
            cb(items);
        } else {
            merge(id, function(item) {
                // push to return array
                if (item) {
                    items.push(item);
                }
                
                // schedule next fetch
                process.nextTick(fetch);
            });
        }
    };
    
    // start fetching
    process.nextTick(fetch);
}

// convert a GUID into an item
var GUIDScanner;
function getGUID(guid, tnum, cb) {
    if (!GUIDScanner) {
        try {
            require.resolve("./scanner");
            GUIDScanner = require("./scanner");
        } catch(e) {
            return cb({error: "PSHome scanner not installed"});
        }
    }

    // run item code check from scanner module
    GUIDScanner.logItemCode(guid, tnum, function(id) {
        if (id) {
            // got an ID! return standard get/item response
            get(id, cb);
        } else {
            d.error(id, "item");
            return cb({error: "Item GUID failed to register"});
        }
    });
}

// get a single item
function get(id, _cache, cb) {
    if (!id) {
        return cb(false);
    }
    
    if (typeof(_cache)=="function") {
        cb = _cache;
        _cache = true;
    }
    
    var g = function() {
        // make query for row of database
        db.query("SELECT i.*, m.item AS merger FROM homestore_items AS i LEFT JOIN homestore_merge AS m ON i.code = m.code WHERE i.id = ?", [id], function(err, rows) {
            if (err) {
                d.error("Failed to fetch item "+id, "item");
                return cb(false);
            }
            
            if (!rows.length) {
                return cb({error: "No such item"});
            }
            
            if (rows[0].merger) {
                // this item is merged! Fetch that one instead
                return get(rows[0].merger, cb);
            }
            
            // fetch rest of item data and callback
            get_data(rows[0], function(a) {
                cb(a);
                
                cache.cache("az4item:" + id, JSON.stringify(a));
            });
        });
    };
    
    if (_cache) {
        cache.get("az4item:" + id, function(err, data) {
            if (data) {
                cb(JSON.parse(data));
            } else {
                g();
            }
        });
    } else {
        g();
    }
}

// get an array of items
function gets(ids, _cache, cb) {
    if (typeof(_cache) == "function") {
        cb = _cache;
        _cache = true;
    }
    
    if (!ids || !ids.length) {
        return cb([]);
    }
    
    // return array
    var items = [];
    
    // fetch each item in turn
    var fetch = function() {
        var id = ids.shift();
        
        if (!id) {
            // we've run out of items to fetch!
            cb(items);
        } else {
            get(id, _cache, function(item) {
                // push to return array
                if (item) {
                    items.push(item);
                }
                
                // schedule next fetch
                process.nextTick(fetch);
            });
        }
    };
    
    // start fetching
    process.nextTick(fetch);
}

function get_basic_data(data) {
    var item = {
        id: data.id,
        image: ((data.hash) ? data.hash : image(data.code) )+".png",
        name: data.name,
        description: data.description,
        tutorial: data.tutorial,
        gender: data.gender,
        panorama: data.pano,
        prices:{},
        type: data.type,
        weight: data.weight,
        dev: data.dev,
        rating_id: data.rating,
        rating: data.crating,
        votes: data.cvotes,
        slots: data.slots
    };
    
    // fill in price object
    for(var ii in item_prices) {
        item.prices[ ii ] = (data[ item_prices[ii] ]) ? data[ item_prices[ii] ] : 0;
    }
    
    return item;
}

// given a single row of data from the database, populate and return
function get_data(data, cb) {
    if (!data) {
        d.warn("Invalid call to get_data", "item");
        return cb(false);
    }
    
    // basic item object
    var item = get_basic_data(data);
    
    // clone the list of things todo
    var todo = [];
    for(var ii=0; ii<fetchers.length; ii++) {
        todo.push(fetchers[ii]);
    }
    
    // return function for our extra data fetches
    var do_merge = function() {
        // grab next method to call
        var method = todo.shift();
        
        if (!method) {
            // we're done!
            cb(item);
        } else {
            // call next method
            method(item, function(d) {
                if (!d) {
                    // fetching data failed :(
                    return cb(false);
                } else {
                    // loop through fetched data and add to object
                    for(var ii in d) {
                        item[ii] = d[ii];
                    }
                    
                    // do next step
                    process.nextTick(do_merge);
                }
            });
        }
    };
    
    // quick hack to grab rating
    if (item.rating_id > 0) {
        // start fetching item data
        process.nextTick(do_merge);
    } else {
        votes.fetch("item_"+item.id, function(r) {
            // update item with it's new rating ID
            db.query("UPDATE homestore_items SET rating = ? WHERE id = ?", [r.rating_id, item.id]);
            
            d.info("Added new vote ID "+r.rating_id+" to item "+item.id, "Item");
            
            item.rating_id = r.rating_id;
            item.rating = r.rating;
            item.votes = r.votes;
            
            // start fetching item data
            process.nextTick(do_merge);
        });
    }
}

// given an array of items from the database, populate and return
function gets_data(rows, cb) {
    var items = [];
    // internal fetcher function
    var fetch = function() {
        var item = rows.shift();
        
        if (item) {
            get_data(item, function(i) {
                if (i) {
                    // yay! next item!
                    items.push(i);
                    
                    // get next one! :D
                    process.nextTick(fetch);
                } else {
                    return cb(false);
                }
            });
        } else {
            // we're done! :D
            cb(items);
        }
    };
    
    // start fetching
    process.nextTick(fetch);
}



// ====== Fetchers ======

function fetch_image_large(item, cb) {
    image_large(item.image, function(e) {
        return cb({
            image_large_exist: e
        });
    });
}

// find updates for this item
function fetch_updates(item, cb) {
    if (!item.id) return cb(false);
    
    db.query("SELECT u.name, u.id, u.type FROM homestore_updates AS u INNER JOIN homestore_updateitems AS l ON l.update_id = u.id WHERE l.item_id = ? GROUP BY u.type ORDER BY u.date DESC", [item.id], function(err, rows) {
        if (err) {
            d.error("fetch_updates SQL error :: "+err, "item");
            return cb(false);
        }
        
        var res = {};
        for(var ii=0; ii<rows.length; ii++) {
            res[ rows[ii].type ] = {
                id: rows[ii].id,
                name: rows[ii].name
            };
        }
        
        return cb({
            updates: res
        });
    });
}

function fetch_cats(item, cb) {
    if (!item.id) {
        return cb(false);
    }
    
    // fun SQL query to get cat IDs
    db.query('SELECT c.name, c.trail, c.id, c.zone FROM homestore_cats AS c, homestore_itemlinks AS l WHERE l.item_id = ? AND l.live = 1 AND c.id = l.cat_id AND c.live = "1"', [item.id], function(error, rows) {
        if (error){
            d.error("fetch_cats SQL error 1 :: "+error, "item");
            return cb(false);
        }
        
        // return array
        var ret  = [];
        var todo = [];
        
        for (var ii=0; ii<rows.length; ii++) {
            // check if the trail is cached in the database
            if (rows[ii].trail) {
                // explode and reimplode cached trail
                var t = rows[ii].trail.split(",").splice(1);
                for (var j=0; j<t.length; j++){
                    t[j] = t[j].split("|")[1];
                }
                
                ret.push({
                    id  : rows[ii].id,
                    name: t.join(" >> ").replace(/%2C/g, ",").replace(/%7C/g, "|"),
                    zone: rows[ii].zone
                });
            } else {
                // not cached, we need to fetch it manually (then cache it)
                todo.push(rows[ii].id);
            }
        }
        
        // check if we have to do anything
        if (todo.length) {
            // callback function to accept categories
            var get_cat = function() {
                // pop first categorty to fetch
                var cat = todo.shift();
                
                if (cat) {
                    // get category trail
                    db.query("SELECT " +
                        "GROUP_CONCAT(parent.name ORDER BY parent.lft ASC separator '|') AS name, " +
                        "GROUP_CONCAT(parent.id ORDER BY parent.lft ASC separator '|') AS ids, " +
                        "node.id, node.zone " +
                        "FROM homestore_cats AS node, homestore_cats AS parent " +
                        "WHERE node.lft " +
                        "BETWEEN parent.lft AND parent.rgt AND node.id = ? AND parent.live = '1'"
                    , [cat], function(err, rows) {
                        if (err) {
                            d.error("Error fetching category trail for category "+cat, "item");
                            return cb(false);
                        }
                        
                        // get this category's name
                        var names = rows[0].name.split("|");
                
                        // push result and return
                        ret.push({
                            id   :rows[0].id,
                            name :names.join(" >> "),
                            zone :rows[0].zone
                        });
                        
                        // now we've got this cat, queue the next one
                        process.nextTick(get_cat);
                        
                        // also, we should cache this result for speedier results in the future!
                        var ids = (""+rows[0].ids).split("|"); // force to string and split
                        var r = [];
			var succ = true;
                        for(var i=0; i<ids.length; i++){
			    if (!names[i]) {
				succ = false;
				break;
				}
                            r.push(ids[i]+"|"+names[i].replace(/,/g, "%2C").replace(/\|/g, "%7C"));
                        }
			if (succ) {
				db.query("UPDATE homestore_cats SET trail = ? WHERE id = ?", [r.join(","), rows[0].id], function(error){
				    if (error) d.error("ERROR MYSQL - fetchCats CACHE UPDATE (category "+cat+") : "+error, "item");
				    d.info("Cached category trail "+cat, "Item");
				});
			}
                    });
                } else {
                    // no more categories to fetch!
                    sort_and_return(ret);
                }
            };
            
            // start fetching categories
            process.nextTick(get_cat);
        } else {
            // return categories for item
            sort_and_return(ret);
        }
    });
    
    var sort_and_return = function(cats) {
        var l = {
            EU: [],
            US: [],
            JP: [],
            HK: []
        };
        
        for(var ii=0; ii<cats.length; ii++) {
            l[ cats[ii].zone ].push(cats[ii]);
        }
        
        // remove update categories if they exist
        for(var a in l) {
            for(var ii=0; ii<l[a].length; ii++) {
                if (l[a][ii].name.substring(0, 11) == "Updates >> ") {
                    l[a].splice(ii, 1);
                }
            }
        }
        
        return cb({
            categories: l.EU.concat(l.US, l.JP, l.HK)
        });
    };
}

// try and download an exact item code/tnum
function _download_code(code, num, cb) {
    // sort out tnum properly
    var tnum = "000";
    if (!isNaN(num)) {
        if (num > 99) {
            tnum = "T" + num;
        } else if (num>9) {
            tnum = "T0" + num;
        } else if (num) {
            tnum = "T00" + num;
        }
    } else {
        tnum = num;
    }
    
    var hash = image(code);
    
    var sml = config.scee_root+"Objects/"+code+"/small"+( (tnum!="000")? "_" + tnum : "" )+".png";
    var lrg = config.scee_root+"Objects/"+code+"/large"+( (tnum!="000")? "_" + tnum : "" )+".png";
    
    var sml_file = config.cdn_root+"/i/"+hash+".png";
    var lrg_file = config.cdn_root+"/l/"+hash+".png";
    
    dl.download_exist(sml, function(e) {
        if (e) {
            // success! :D
            // try to download large version first
            dl.download(lrg, lrg_file, function() {
                // wait for large download to succeed/fail (we don't really care)
                dl.download(sml, sml_file, function(e) {
                    d.debug("Downloaded "+sml, "item");
                    return cb(e);
                });
            });
        } else {
            // fail :'(
            d.debug("Failed to find "+sml, "item");
            return cb(false);
        }
    });
}

function _new_item(code, tnum, cb) {
    if (typeof(tnum) == "function") {
        cb = tnum;
        tnum = -1;
    }
    
    if (tnum) {
        db.query("INSERT IGNORE INTO homestore_items (code, tnum, gender) VALUES (?, ?, '')", [code, tnum], function(error){
            if (error) {
                d.error("Insert item into homestore_items error :: "+error, "item");
                return cb(false);
            }
            
            db.query("INSERT IGNORE INTO homestore_wtf (code) VALUES (?)", [code], function(_error){
                if (_error) {
                    d.error("Insert item into homestore_wtf error :: "+error, "item");
                }
                return cb(true);
            });
        });
    } else {
        db.query("INSERT IGNORE INTO homestore_items (code, tnum, gender) VALUES (?, -1, '')", [code], function(error){
            if (error) {
                d.error("Insert item into homestore_items error :: "+error, "item");
                return cb(false);
            }
            
            db.query("INSERT IGNORE INTO homestore_wtf (code) VALUES (?)", [code], function(_error){
                if (_error) {
                    d.error("Insert item into homestore_wtf error :: "+error, "item");
                }
                return cb(true);
            });
        });
    }
}

var download_queue = [];

function download(code, tnum, cb, force) {
    d.debug("Attempting to download "+code+( tnum ? " ("+tnum+")" : "" ) + ( force ? " [forced]" : "" ), "item");
    
    var hash = image(code);
    
    var sml_file = config.cdn_root+"/i/"+hash+".png";
    var sml_web = config.cdn_web+"/i/"+hash+".png";
    
    // check if files exists first
    if ( force || !require('fs').existsSync(sml_file) ) {
        // check item graveyard first
        if ( !force && require('fs').existsSync(config.cdn_root+"/dead/"+code+".dat") ) {
            return cb(false);
        }
        
        if (tnum) {
            // we have a tnum! lets use it!
            _download_code(code, tnum, function(e) {
                if (e) {
                    // yay! insert into homestore_items
                    _new_item(code, tnum, function(_e) {
                        if (!_e) {
                            return cb(false);
                        } else {
                            return cb(sml_web);
                        }
                    });
                } else {
                    d.error("Supplied tnum, but failed :( "+code+" "+tnum, "item");
                    return cb(false);
                }
            });
        } else {
            // no tnum?!?! brute force this!
            // check download queue first
            for(var ii=0; ii<download_queue.length; ii++) {
                if (download_queue[ii].code == code) {
                    // found a download already pending, push callback to stack and return
                    download_queue[ii].cbs.push(cb);
                    return;
                }
            }
            
            // add current download to queue to stop double fetching
            download_queue.push({
                code: code,
                cbs: [cb]
            });
            
            var todo = [];
            
            var fetch = function() {
                if (todo.length) {
                    var cur = todo.shift();
                    
                    d.debug("Attempting to download "+code+" with tnum "+cur, "item");
                    
                    _download_code(code, cur, function(e) {
                        if (e) {
                            // whooo! stop downloading now! :D
                            _new_item(code, cur, function(_e) {
                                if (!_e) {
                                    return cb(false);
                                } else {
                                    for(var ii=0; ii<download_queue.length; ii++) {
                                        if (download_queue[ii].code == code) {
                                            // splice queue element out
                                            var a = download_queue.splice(ii, 1);
                                            
                                            // do all callbacks
                                            for(var jj=0; jj<a[0].cbs.length; jj++) {
                                                a[0].cbs[jj](sml_web);
                                            }
                                            
                                            return;
                                        }
                                    }
                                    
                                    // er... shouldn't be here!
                                    return cb(false);
                                }
                            });
                        } else {
                            // aww, no luck :(
                            process.nextTick(fetch);
                        }
                    });
                } else {
                    // ran out! dead item :(
                    require('fs').writeFile(config.cdn_root+"/dead/"+code+".dat", "{}");
                    return cb(false);
                }
            };
            
            // build a todo list
            var i = 32;
            todo.push("000");
            for(var x=0; x<300; x++) {
                var l = i - x;
                var h = i + x;
                if (l >= 0) todo.push(l);
                if (h > i)  todo.push(h);
            }
            
            // start off the search!
            process.nextTick(fetch);
        }
    } else {
        // already exists, return.
        // ... but first make sure it's in homestore_items and wtf (happens on dev)
        _new_item(code, function() {
            d.debug("Item "+code+" already downloaded!", "item");
            return cb(sml_web);
        });
    }
}

// testing
if (!module.parent) {
    download("01A68202-8A724FF4-91CDD9F7-CEA11623", null, function(e) {
        console.log(e);
    }, true);
}
