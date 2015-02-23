/*
This is the AlphaZone4 Item Scanner.
It is basically it's own class and should be started from within the standard AZ4 API
*/

// load modules
var db      = require("./db"),
    item    = require("./item"),
    config  = require("./config"),
    spaces  = require("./spaces"),
    d       = require("./debug"),
    http    = require('http'),
    az4status = require("./status"),
    fs      = require("fs");

var httpProxy = require('http-proxy');
var proxy = new httpProxy.RoutingProxy();

var returnScan = function(id, code, cc, ip){
    var itemR = {
        id: id,
        im: item.image(code),
        cc: cc
    };
    item.image_large(itemR.im, function(t) {
        itemR.lg = t;
//        if (sockets[ip].sock!==null) sockets[ip].sock.emit('item', itemR);
        for(var i in sockets)
        {
            if (sockets[i].sock != null)
            {
                sockets[i].sock.emit('item', itemR);
            }
        }
    });
};

var fetchScanItem = function(code, ip){
    db.query("SELECT id FROM homestore_items WHERE code = ?", [code], function(error, rows){
        if (rows.length>0){
            // already in database! Do some processing and return
            var iid = rows[0].id;
            
            // merge item ID
            item.merge(iid, function(iid) {
            
                db.query("SELECT DISTINCT(c.zone) FROM homestore_itemlinks AS l INNER JOIN homestore_cats AS c ON c.id = l.cat_id WHERE l.live = 1 AND l.item_id = ? AND c.live = '1'", [iid], function(error, rows){
                    // now we have the country codes
                    var cc = [];
                    for(var i=0; i<rows.length; i++){
                        cc.push(rows[i].zone);
                    }
                    returnScan(iid, code, cc, ip);
                });
                
            });
        }else{
            console.log("This shouldn't happen... function only used for already scanned items... D= "+code+" :: "+ip);
        }
    });
};

var parse_code = function(code, tnum, ip){
    saveSocket(ip); // make sure sockets object at least exists for this IP
    
    // update tnum
    if (typeof(tnum) != "undefined" && tnum !== null) {
        var res = tnum.match(/^T([0-9]*)/);
        if (res[1]) {
            d.info("Found tnum "+res[1]+" for "+code, "scanner");
            // don't care about waiting for this to finish
            db.query("UPDATE homestore_items SET tnum = ? WHERE code = ?", [res[1], code]);
        }
    }
    
    // don't bother processing the same code twice
    for(var ii=0; ii<sockets[ip].items.length; ii++) {
        if (sockets[ip].items[ii] == code) return;
    }
    
    var push_item = function() {
        // only store 100 items per user in memory
        if (sockets[ip].items.length > 100) sockets[ip].items.shift();
            
        // push to this user's list
        sockets[ip].items.push(code);
        
        // log item and process
        exports.logItemCode(code, tnum, function(id, cc){
            // returns item id and country codes
            returnScan(id, code, cc, ip);
        });
    };
    
    if (sockets[ip].admin) {
        push_item();
    } else {
        // check if this is a crap item
        db.query("SELECT crap, dead FROM homestore_wtf WHERE code = ?", [code], function(error, rows) {
            // if there are no rows from WTF or the row crap indicator isn't true, process
            if (!rows.length || (rows[0].crap != "1" && rows[0].dead != "1") ) {
                push_item();
            }
        });
    }
};

// "log"ItemCode - handles code and returns the item object
//  this function should always be used when importing codes to the database
//  TODO: write a new function if we want to accept full URLs, can easily be done using the existing regex etc.
exports.logItemCode = function(code, tnum, cb){
    db.query("SELECT id, tnum FROM homestore_items WHERE code = ?", [code], function(error, rows){
        if (rows.length>0) {
            // already in database! Do some processing and return
            // hello, no tnum stored!!!
            if (tnum && !rows[0].tnum) {
                var res = tnum.match(/^T([0-9]*)/);
                if (res[1]) {
                    db.query("UPDATE homestore_items SET tnum = ? WHERE code = ?", [res[1], code], function() {
                        return _loadItemCode(rows[0].id, cb);
                    });
                } else {
                    return _loadItemCode(rows[0].id, cb);
                }
            } else {
                return _loadItemCode(rows[0].id, cb);
            }
        } else {
            // not in database!
            // TODO: First check if this is already in the merge table (and JOIN select with homestore_items for ease)
            db.query("SELECT item FROM homestore_merge WHERE code = ?", [code], function(error, rows) {
                if (rows.length === 0) {
                    // item isn't merged anyway, download it as normal
                    item.download(code, tnum, function(t) {
                        if (t) {
                            // image(s) was downloaded! return a scanned object
                            db.query("INSERT IGNORE INTO homestore_wtf (code) VALUES (?)", [code]);
                            if (tnum) {
                                d.info("New item downloaded! "+code+" - "+tnum);
                                db.query("INSERT IGNORE INTO homestore_items (code, tnum, gender) VALUES (?, ?, '')", [code, tnum]);
                            } else {
                                db.query("INSERT IGNORE INTO homestore_items (code, tnum, gender) VALUES (?, -1, '')", [code]);
                            }

                            db.query("SELECT id FROM homestore_items WHERE code = ?", [code], function(err, rows) {
                                _loadItemCode(rows[0].id, cb);
                            });
                        } else {
                            // found item with no image, log it
                            d.error("Item "+code+" did not scan ["+( (tnum) ? tnum : "null" )+"] ", "scanner");
                            return cb(false, {});
                        }
                    });
                } else {
                    // cool, we found a merged item, return the original item ID data
                    _loadItemCode(rows[0].id, cb);
                }
            });
        }
    });
};

// fetch zones for item and return object
function _loadItemCode(id, cb){
    item.merge(id, function(id) {
        db.query("SELECT DISTINCT(c.zone) FROM homestore_itemlinks AS l INNER JOIN homestore_cats AS c ON c.id = l.cat_id WHERE l.live = 1 AND l.item_id = ? AND c.live = '1'", [id], function(error, rows){
            // now we have the country codes
            var cc = [];
            for(var i=0; i<rows.length; i++){
                cc.push(rows[i].zone);
            }
            // callback with item ID and countries
            cb(id, cc, false);
        });
    });
}

var saveXML = function(xml){
    db.query("INSERT IGNORE INTO db_xmls (`xml`) VALUES (?)", [xml]);
};

var saveSocket = function(ip, sock){
    if (!sockets[ip]) sockets[ip] = {sock: ((!sock) ? null : sock), items: []};
};

var spaceExtraReg = /\/Scenes\/[^\/]*\/([^\.]*)\.(sdat|sdc)/g;
var spaceFilenameReg = /_T[0-9]{3}/g;

// test objects
var tests = {
    code: {
        regex: new RegExp(/([0-9A-Z]{8}-[0-9A-Z]{8}-[0-9A-Z]{8}-[0-9A-Z]{8})\/(object|small|large)_?(T[0-9]{3})?/),
        call: function(data, url, ip){
            // found code regex match!
            if (data[3]) {
                parse_code(data[1], data[3], ip);
            } else {
                parse_code(data[1], null, ip);
            }
        },
        online: true
    },
    space: {
        regex: new RegExp(/\/Scenes\/([^\/]*)\/(?:.*(_T[0-9]{3}))?\.(sdc|png|sdat)/),
        call: function(data, url, ip){
            if (data[2]) {
                // check for filename
                var t = spaceExtraReg.exec(url);
                if (t && t[2]) {
                    t[1] = t[1].replace(spaceFilenameReg, '');
                    spaces.parse(data[1], data[2], t[1]);
                } else {
                    spaces.parse(data[1], data[2]);
                }
            } else {
                spaces.parse(data[1]);
            }
        },
        online: true
    },
    maintenance: {
        regex: new RegExp(/Localisation\/MaintenanceMessage\.xml/),
        call: function(){
            d.info("Home maintenance still active", "scanner");
        },
        online: false
    },
    xmls: {
        regex: new RegExp(/(.*\.xml)/),
        call: function(data, url, ip){
            saveXML(url);
        },
    }
};

// socket control
var sockets = {
};

function staticFile(f, res, type){
    require('fs').readFile(__dirname+'/static/'+f, function(error, content){
        if (error){
            res.writeHead(500);
            res.end();
        }else{
            res.writeHead(200, { 'Content-Type': type });
            res.end(content, 'utf-8');
        }
    });
}

function prox(req, res) {
    var host = req.headers.host;
    
    if (host == "scanner.alphazone4.com" || host == "scannerdev.alphazone4.com") {
        host = "scee-home.playstation.net";
    }
    
    proxy.proxyRequest(req, res, {
        host: host,
        port: 80
    });
}

function staticItemImage(guid, dir, res, req){
    var f = config.cdn_root+"/"+dir+"/"+item.image(guid)+".png";
    require('fs').exists(f, function(e) {
        if (e) {
            // serve AZ4 one (faster)
            require('fs').readFile(f, function(error, content){
            if (error){
                prox(req, res);
            }else{
                d.info("Serving local cached version of "+guid+"!", "scanner");
                res.writeHead(200, { 'Content-Type': 'image/png' });
                res.end(content, 'utf-8');
            }
        });
        } else {
            prox(req, res);
        }
    });
}

// == start server ==
exports.init = function() {
    d.info("Starting AlphaZone4 Scanner", "scanner");
    var app = http.createServer(function (req, res) {
        // parse the supplied URL
        var data = require('url').parse(req.url, true);
        if ( (data.pathname == "/") || (data.pathname === "") || (data.pathname == "/favicon.ico") ) {
            res.writeHead(200);
            res.end("Everything is fine. =)\nLove, Stapler-bot", 'utf-8');
            return;
        }
        
        if (data.pathname == "/scanner.js") return staticFile("scanner.js", res, "text/javascript");
        
        // test if we're in sockets (save the item anyway)
        var ip = require("./tools").getIP(req);
        saveSocket(ip);
        
        // forward response immediately to a real server
        d.debug(ip+"\t"+data.pathname, "scanner");
        
        if (tests.maintenance.regex.exec(data.pathname)===null) {
            // next check if we're manually intercepting this item or not
            var isGUID = tests.code.regex.test(data.pathname);
            if (isGUID && data.pathname.toLowerCase().indexOf(".sdat") > 5) {
                var m = tests.code.regex.exec(data.pathname);
                if (m[1] && fs.existsSync(__dirname+'/static/'+m[1]+'.sdat')) {
                    d.info("PROXYING ITEM "+m[1], "scanner");
                    staticFile(m[1]+'.sdat', res, "text/plain");
                } else {
                    prox(req, res);
                }
            } else if (isGUID && data.pathname.toLowerCase().indexOf(".png") > 5) {
                // we have an item image! let's proxy it!
                var m = tests.code.regex.exec(data.pathname);
                d.info("Trying to serve image of "+m[1], "scanner");
                if (/small/.test(data.pathname)) {
                    // proxy small image
                    staticItemImage(m[1], "i", res, req);
                } else {
                    // proxy large image!
                    staticItemImage(m[1], "l", res, req);
                }
            } else if (tests.space.regex.test(data.pathname) && data.pathname.toLowerCase().indexOf(".sdat") > 5) {
                var m = tests.space.regex.exec(data.pathname);
                if (m[1] && fs.existsSync(__dirname+'/static/'+m[1]+'.sdat')) {
                    d.info("PROXYING SPACE "+m[1], "scanner");
                    staticFile(m[1]+'.sdat', res, "text/plain");
                } else {
                    prox(req, res);
                }
            } else if (tests.xmls.regex.test(data.pathname)) {
                var filename = require("path").basename(data.pathname);
                
                if (fs.existsSync(__dirname+'/static/'+filename)) {
                    d.info("PROXYING XML FILE "+filename, "scanner");
                    staticFile(filename, res, "text/xml");
                } else {
                    prox(req, res);
                }
            } else {
                prox(req, res);
            }
        } else {
            // we matched the Maintenance message, return the static version instead
            staticFile("MaintenanceMessage.xml", res, "text/xml");
        }
        
        // now process this URL (:D we've already replied, how efficient!)
        for(var t in tests) {
            var m = tests[t].regex.exec(data.pathname);
            if (m!==null) {
                // set Home to online/offline
                if (typeof(tests[t].online) != "undefined") {
                    if (tests[t].online) {
                        az4status.set(true);
                    } else {
                        az4status.set(false);
                    }
                }
                tests[t].call(m, data.pathname, ip);
            }
        }
    });

    app.listen(config.server.scanner, function(){
        d.info("Scanner started", "scanner");
    });
    
    var io = require('socket.io').listen(app);
    io.set('log level', 1);
    io.set('transports', ['xhr-polling']);

    io.set('origins', 'wiki.alphazone4.com:*');
    
    io.sockets.on('connection', function(socket) {
        var ip = socket.handshake.headers['x-real-ip'];
        if (socket.handshake.headers['cf-connecting-ip']) ip = socket.handshake.headers['cf-connecting-ip'];
        
        if (!sockets[ip]) {
            sockets[ip] = {sock: null, items:[]};
        }
        
        if ( sockets[ip].sock && (sockets[ip].sock!==null) ) {
            // duplicate connection, this will just... cause mayhem. DISALLOW.
            socket.emit("close", {});
            d.warn("Duplicate connection from " + ip + ", dropping", "scanner");
            return;
        } else {
            // already have some items?!... :D
            if (sockets[ip].items.length>0){
                for(var i=0; i<sockets[ip].items.length; i++){
                    fetchScanItem(sockets[ip].items[i], ip);
                }
            }
            // new connection
            d.info("New connection from " + ip, "scanner");
            sockets[ip].sock = socket;
            
            // see if we're an admin
            if (ip == '81.174.146.241') {
                sockets[ip].admin = true;
            }
        }
        
        socket.on('disconnect', function(){
            // kill socket
            sockets[ip].sock = null;
            d.info("Client "+ip+" disconnected.", "scanner");
        });
    });
};
