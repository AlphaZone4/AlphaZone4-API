/*
Fetch data on spaces etc.
*/
// load database
var db     = require("./db.js"),
    config = require("./config"),
    dl     = require("./dl"),
    d      = require("./debug");

var spaces = null;
var lastfetch = 0;
var spaces_num = 0;
exports.getSpaces = function(cb) {
    refresh(cb);
    return false;
};

exports.getSpace = function(slug, res, cb){
    refresh(function(){
        for(var i=0; i<spaces.list.length; i++){
            if (spaces.list[i].slug == slug){
                cb(spaces.list[i]);
                return;
            }
        }
        // didn't return, so we never found it
        return cb({error: "No such space"});
    });
    return false;
};

function refresh(cb) {
    // store results for 30 minutes
    if ( (!spaces) || (spaces.list.length === 0) || (Math.round(new Date().getTime() / 1000) > (lastfetch+1800))){
        if ( (spaces) && (spaces.list.length>0) ){
            if (cb) cb(spaces);
            cb = null;
        }
        
        if (!spaces){
            spaces = {list:[], upcoming:[]};
        }
        db.query("SELECT * FROM db_spaces", function(error, rows){
            var count = 0;
            var l = rows.length;
            var check = function(s){
                count += 1;
                if (count >= l){
                    // store fetch time
                    lastfetch = Math.round(new Date().getTime() / 1000);
                    // sort
                    spaces.list = spaces.list.sort(spacesOrder);
                    // store spaces num
                    spaces_num = spaces.list.length;
                    // callback new fetched results
                    if (cb) cb(spaces);
                }
            };
            
            for(var i=0; i<rows.length; i++){
                parseSpace(rows[i], check);
            }
        });
    }else{
        if (cb) cb(spaces);
    }
}

function spacesOrder(a, b){
    var amin = null;
    var bmin = null;
    for(var i in a.regions){
        if ( (!amin) || (amin > a.regions[i]) ) amin = a.regions[i];
    }
    for(var i in b.regions){
        if ( (!bmin ) || (bmin > b.regions[i]) ) bmin = b.regions[i];
    }
    return bmin - amin;
}

// actually get space information and return it for caching
function parseSpace(space, cb){
    var data_image = null;
    var data_item = null;
    var data_pano = null;
    var check_data = function(){
        if ((data_image) && (data_item) && (data_pano)) {
            // we has the data, let's merge and forward.
            // add data from item data if it's missing...
            if (data_item.id) {
                if (space.description === "") space.description = data_item.description;
                space.price = {};
                for(var p in data_item.prices){
                    if (data_item.prices[p] !== 0) space.price[p] = data_item.prices[p];
                }
                space.media = data_item.media;
                // TODO - also fetch images from image gallery?...
                // is this file becomming huge now? Maybe gallery is seperate ajax request...
            }
            space.pano = data_pano;
            // finally, add this space
            addSpace(space, data_image, cb);
        }
    };
    // fetch space image fork
    db.query("SELECT s.code FROM db_spaces_icons AS i, homestore_spaces AS s WHERE i.icon_id = s.id AND i.space_id = ? ORDER BY i.weight ASC LIMIT 1", [space.id], function(error, rows){
        data_image = "4cce49af5108ab80af7989b5ca78657a";
        if (error) console.log(error);
        if (rows.length > 0){
            var a = rows[0].code.split("|");
            data_image = exports.image(a[0], a[1]);
        }
        check_data();
    });
    // fetch space item data - if exists - fork
    if (space.item_id > 0) {
        // cool, there is an item attached to this space
        require("./item.js").get(space.item_id, function(data){
            data_item = data;
            check_data();
        });
    } else {
        // no item attached to this space, blank it and callback
        data_item = {};
        check_data();
    }
    // check if we are supporting panoramas or not
    require('fs').exists(config.cdn_root+"/p/"+space.slug+"/1_out.swf", function(yeh){
        var dp = [];
        if (yeh){
            dp.push({
                path: 1,
                name: space.name
            });
        }
        // now also check for additional panoramas
        db.query("SELECT pano_id, description FROM db_spaces_pano WHERE space_id = ?", [space.id], function(error, rows){
            for(var i=0; i<rows.length; i++){
                if (!data_pano) data_pano = [];
                dp.push({
                    path: rows[i].pano_id,
                    name: rows[i].description
                });
            }
            data_pano = dp;
            check_data();
        });
    });
}

var gallery_url = "http://alphazone4.com/gallery/albums/";
exports.spaceMedia = function(slug, cb){
    // first, find the space in our dataset
    refresh(function(){
        for(var i=0; i<spaces.list.length; i++){
            if (spaces.list[i].slug == slug){
                var space = spaces.list[i];
                // we found the space! do stuff.
                // our data handlers
                var check_data = function(){
                    if (
                        (data_item)
                            &&
                        (data_gallery)
                    ) {
                        // we have all our data, so return it!
                        cb(data_item.concat(data_gallery));
                    }
                };
                var data_item = null;
                var data_gallery = null;
                // first, grab media attached to the item version (if it exists)
                if (space.item_id > 0){
                    // cool, there is an item attached to this space
                    require("./item.js").itemMedia(space.item_id, null, function(data){
                        // put data into nice format
                        data_item = [];
                        for(var i=0; i<data.length; i++) {
                            data_item.push(data[i]);
                        }
                        // check out data
                        check_data();
                    });
                }else{
                    data_item = [];
                }
                // also try the media galleries
                if (space.gallery_id > 0){
                    db.query("SELECT filepath, filename FROM gallery_pictures WHERE aid = ? AND approved = ? ORDER BY position ASC", [space.gallery_id, "YES"], function(error, rows){
                        data_gallery = [];
                        if (rows.length > 0){
                            for(var i=0; i<rows.length; i++){
                                data_gallery.push({
                                    type: "az4",
                                    data: rows[i].caption+"|"+rows[i].filepath+"|"+rows[i].filename
                                });
                            }
                        }
                        // check if we have all our data yet
                        check_data();
                    });
                }else{
                    // wtf? no gallery ID?!... should create it. (is this the right place?) TODO
                    data_gallery = [];
                    check_data();
                }
                // return to stop the loop
                return;
            }
        }
        // didn't return, so we never found it
        return cb({error: "No such space"});
    });
    return false;
};

function addSpace(space, image, cb){
    var min = myMin([space.EU, space.US, space.JP, space.HK]);
    //var max = myMax([space.EU, space.US, space.JP, space.HK]);
    var now = Math.round(new Date().getTime() / 1000);
    if (min < now){
        // is released somewhere, so add to list
        var a = {
            name: space.name,
            slug: space.slug,
            regions:{},
            keywords: space.keywords,
            description: space.description,
            type: space.type,
            image: image,
            gallery_id: space.gallery_id,
            pano: space.pano
        };
        if (space.price) {
            a.price = space.price;
            a.item_id = space.item_id;
        }
        // regions
        if ((space.EU > 0) && (space.EU < now)) a.regions.EU = space.EU;
        if ((space.US > 0) && (space.US < now)) a.regions.US = space.US;
        if ((space.JP > 0) && (space.JP < now)) a.regions.JP = space.JP;
        if ((space.HK > 0) && (space.HK < now)) a.regions.HK = space.HK;
        // push onto list (check if it exists already first)
        var found = -1;
        for(var i=0; i<spaces.list.length; i++){
            if (spaces.list[i].slug == space.slug){
                found = i;
                break;
            }
        }
        if (found >= 0){
            spaces.list[i] = a;
        }else{
            spaces.list.push(a);
        }
    }else{
        spaces_num--; // subtract num from expected amount
    }
    // future spaces!
    if (space.EU > now) addUpcoming(space, "EU");
    if (space.US > now) addUpcoming(space, "US");
    if (space.JP > now) addUpcoming(space, "JP");
    if (space.HK > now) addUpcoming(space, "HK");
    // callback
    if (cb) cb(space);
}

function addUpcoming(space, region){
    var check = -1;
    for(var i=0; i<spaces.upcoming.length; i++){
        if (spaces.upcoming[i].name == space.name) check = i;
    }
    if (check >= 0){
        spaces.upcoming[check].regions.push(region);
    }else{
        spaces.upcoming.push({
            name:space.name,
            regions:[region]
        });
    }
}

function myMin(arr){
    var min = 9999999999999999999;
    for (var i=0; i<arr.length; i++)
        if ( (arr[i] > 0) && (arr[i] < min) ) min = arr[i];
    return min;
}

function myMax(arr){
    var max = 0;
    for (var i=0; i<arr.length; i++)
        if ( (arr[i] > max) ) max = arr[i];
    return max;
}

exports.image = function(code, post){
    // TODO - replace this when I update space image downloader
    return require("./md5").hash("MD5sucks:D"+code+"spacemd5thingpizzahmmm");
    //return require("./md5").hash(settings.hash_space.pre+code+post+settings.hash_space.post);
};

function pad(n, width, z) {
  z = z || '0';
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

// == scanner functions ==
function updateFilesize(code, tnum, filename, cb) {
    dl.filesize(config.scee_root+"Scenes/"+code+"/"+filename+( (tnum!="000")? "_T"+pad(tnum, 3):"" )+".sdat", function(filesize) {
        db.query("UPDATE db_homespaces SET filesize = ? WHERE code = ?", [filesize, code], function() {
            if (cb) cb(filesize);
        });
    });
}
exports.update_filesize = updateFilesize;

exports.parse = function(code, tnum, filename, cb){
    if (!code) return;
    
    if (!tnum) tnum = "";
    
    tnum = tnum.replace(/\D/g, '');
    
    d.info("Parsing space "+code+" with tnum "+tnum, "spaces");
    
    // new parsing too!
    db.query("SELECT * FROM db_homespaces WHERE code = ?", [code], function(err, rows) {
        if (rows.length) {
            // alas, already got this space
            
            // see if we have a filename now
            if (filename && rows[0].file != filename) {
                db.query("UPDATE db_homespaces SET file = ? WHERE code = ?", [filename, code], function(err, res) {
                    
                });
            }
            
            if (filename && rows[0].filesize <= 1) {
                updateFilesize(code, tnum, filename);
            }
            
            // make sure the space hash is up-to-date
            if (rows[0].hash === "") {
                db.query("UPDATE db_homespaces SET hash = ? WHERE code = ?", [exports.image(code), code], function(err, res) {
                
                });
            }
            
            if (rows[0].tnum != tnum) {
                // a new tnum? aha!
                d.info("New tnum for space "+code, "spaces");
                updateFilesize(code, tnum, filename, function() {
                    db.query("UPDATE db_homespaces SET tnum = ?, updated = NOW() WHERE code = ?", [tnum, code], function(err, res) {
                        // re-download space icon
                        exports.spaceDownload(code, tnum, cb, true);
                    });
                });
            }
        } else {
            // new space!
            d.info("Found a new space! "+code, "spaces");
            if (!filename) {
                db.query("INSERT INTO db_homespaces (`code`, `tnum`, `hash`, `updated`) VALUES (?, ?, ?, NOW())", [code, tnum, exports.image(code)], function(err, res) {
                    d.info("Found new space "+code+" ("+tnum+"), trying to download...", "spaces");
                    // download space icon
                    exports.spaceDownload(code, tnum, cb);
                });
            } else {
                // has filename! check it's filesize...
                dl.filesize(config.scee_root+"Scenes/"+code+"/"+filename+( (tnum!="000")? "_T"+tnum:"" )+".sdat", function(filesize) {
                    db.query("INSERT INTO db_homespaces (`code`, `tnum`, `filename`, `hash`, `filesize`, `updated`) VALUES (?, ?, ?, ?, ?, NOW())", [code, tnum, filename, exports.image(code), filesize], function(err, res) {
                        d.info("Found new space "+code+"/"+filename+" ("+tnum+"), trying to download...", "spaces");
                        // download space icon
                        exports.spaceDownload(code, tnum, cb);
                    });
                });
            }
        }
    });
};

var code_mem = {
};
var tnum_max = 500;
exports.spaceDownload = function(code, tnum, cb, force){
    // get filename of image result
    var im = exports.image(code);
    
    // check if it already exists
    if (force || !require('fs').existsSync(config.cdn_root+"/s/"+im+".png")){
        if ( tnum && tnum !== "" ){
            // we have a tnum supplied :D
            d.info("Trying: "+config.scee_root+"Scenes/"+code+"/small"+( (tnum!="000")? "_T"+tnum:"" )+".png");
            dl.download_exist(config.scee_root+"Scenes/"+code+"/small"+( (tnum!="000")? "_T"+tnum:"" )+".png", function(e){
                if (e) {
                    // small file exists! Download and then try large TODO
                    dl.download(config.scee_root+"Scenes/"+code+"/large"+( (tnum!="000")? "_T"+tnum:"" )+".png", config.cdn_root+"/q/"+im+".png", function(){
                        // make sure the large image downloads first
                        dl.download(config.scee_root+"Scenes/"+code+"/small"+( (tnum!="000")? "_T"+tnum:"" )+".png", config.cdn_root+"/s/"+im+".png", function(t){
                            if (t) {
                                d.info("Downloaded new space: "+code+" ("+tnum+") "+im, "spaces");
                                db.query("UPDATE db_homespaces SET tnum = ?, hash = ? WHERE code = ?", [tnum, im, code], function() {
                                    if (cb) cb(config.cdn_web+"/q/"+im+".png");
                                });
                            } else {
                                return d.error("Downloading Space FAIL: "+code+" "+tnum, "spaces");
                            }
                        });
                    });
                } else {
                    // no exist! TODO: add to dead heap
                    if (cb) cb(false);
                }
            });
        } else {
            d.info("Brute force space image", "spaces");
            // no tnum, big loop time!
            if (!code_mem[code]){
                // store in memory
                code_mem[code] = true;
                var i = 0;
                var stopped = false;
                // create callback function
                var dlcheck = function(tr){
                    if ( (!tr) && (i<=tnum_max) && (!stopped) ){
                        // start with higher number in checks, slightly more efficient
                        if (i>99){
                            exports.spaceDownload(code, i, dlcheck);
                        }else if(i>9){
                            exports.spaceDownload(code, "0"+(""+i), dlcheck);
                        }else{
                            exports.spaceDownload(code, "00"+(""+i), dlcheck);
                        }
                        i += 1;
                    }else{
                        // either we found it or we ran out of loop
                        if (!stopped){
                            delete code_mem[ code ];
                            if (tr){
                                // found it!
                                if (cb) cb(tr);
                            }else{
                                if (cb) cb(false);
                            }
                        }
                        stopped = true;
                    }
                };
                // 5 threads
                for(var a=0; a<5; a++){
                    dlcheck(false);
                }
            }
        }
    }else{
        // file already exists! return true (?)
        d.info("File already exists!", "spaces");
        if (cb) cb(config.cdn_web+"/q/"+im+".png");
    }
};

refresh();
