// load modules
var settings = require("./config"),
    serial   = require("./serialize"),
    crypto   = require("crypto"),
    db       = require("./db"),
    d        = require("./debug");

// module exports
exports.createSession =     userSession;
exports.checkSession =      userSessionValidate;
exports.validateCookie =    validateCookie;
exports.getUserId =         getUserId;
exports.ID2User =           ID2User;
exports.userCan =           userCan;
exports.check   =           check;
exports.isCached=           isCached;

// basic module configuration
var anon_user = {ID:0, user_login:"Anon", display_name:"Anon"};

// cheater function for quick auth checking
function check(args, auth, cb) {
    getUserId(args, function(user_id) {
        if (!user_id) return cb(false);
        
        userCan(user_id, auth, function(e) {
            if (!e) return cb(false, user_id);
            
            return cb(true, user_id);
        });
    });
}

// internal session system
function userSession(username) {
    var d = Math.round(new Date().getTime() / 1000);
    d = Math.round(d/(60*60*24));
    var rand = Math.floor(Math.random()*100000000);
    var key = username+":"+d+":"+rand;
    var hmac = require("crypto").createHash('sha1');
    hmac.update(key);
    return hmac.digest('hex')+":"+rand;
}

function userSessionValidate(username, key) {
    var d = Math.round(new Date().getTime() / 1000);
    d = Math.round(d/(60*60*24));
    var parts = key.split(":");
    for(var i=d-2; i<d+2; i++){
        var hmac = require("crypto").createHash('sha1');
        hmac.update(username+":"+i+":"+parts[1]);
        if (hmac.digest('hex')+":"+parts[1] == key){
            return true;
        }
    }
    return false;
}

function validateCookie(cookie, cb) {
    var s = cookie.split("%7C"); // %7C = urlencode("|")
    // verify the cookie hasn't expired
    if (s[1] > Math.round(new Date().getTime() / 1000)) {
        // search for the username
        db.db.query("SELECT ID, user_login, user_pass FROM "+settings.database.prefix+"users WHERE user_login = ? LIMIT 1", [s[0]], function(error, rows){
            if (error) {
                d.error("DB ERROR - AUTH.JS "+error, "auth");
                return cb(false);
            }
            
            if (rows.length>0) {
                // Validate the hash contained within the cookie
                var pass_frag = rows[0].user_pass.substr(8, 4);

                var key = wp_hash(rows[0].user_login+"|"+pass_frag+"|"+s[1]+"|"+s[2]);
                var hmac = crypto.createHmac("sha256", key);
                hmac.update(rows[0].user_login+'|'+s[1]+'|'+s[2]);
                var hash = hmac.digest("hex");
                if(hash == s[3]){
                    cb({id:rows[0].ID, user_pass:rows[0].user_pass, user_login:rows[0].user_login});
                }else{
                    cb(anon_user);
                }
            }else{
                cb(anon_user);
            }
        });
    } else {
        cb(false);
    }
}

function isCached(req, cb) {
    check(req, "itemdatabase_scan", cb);
}


function getUserId(req, cb) {
    var cookies = {};
    if ( (req.headers) && (req.headers.cookie) && (req.headers.cookie.indexOf(";")!=-1) ) {
        req.headers.cookie.split(';').forEach(function( cookie ) {
            var parts = cookie.split('=');
            cookies[ parts[ 0 ].trim() ] = ( parts[ 1 ] || '' ).trim();
        });
    }
    if (cookies["wordpress_logged_in_"+settings.cookie]) {
        // user has presented a cookie :D
        validateCookie(cookies["wordpress_logged_in_"+settings.cookie], function(user){
            if (user.id) return cb(user.id);
            cb(0);
        });
    } else {
        cb(0);
    }
}

function ID2User(id, cb) {
  if (!id) return cb(anon_user);
  require("./db.js").db.query("SELECT ID, user_login, display_name FROM "+settings.database.prefix+"users WHERE ID = ? LIMIT 1", [id], function(error, rows){
    if (error) console.log(error);
    if (rows.length === 0){
      cb(anon_user);
    }else{
      cb(rows[0]);
    }
  });
}

function wp_hash(data) {
    var salt = "";
    var secret_key = "";
    if(settings.logged_in_key) {
        secret_key = settings.logged_in_key;
    }
    if(settings.logged_in_salt) {
        salt = settings.logged_in_salt;
    }
    var hmac = crypto.createHmac("md5", secret_key+salt);
    hmac.update(data);
    return hmac.digest("hex");
}

var siteroles = {};
var siteuserroles = {};
var lastSiteRoleFetch = 0;

function userCan(user, role, callback) {
    // handle when we are just passed a user ID instead of an object
    if (!isNaN(user)) user = {id: user, user_name: "", user_pass: ""};
    
    if (siteuserroles[user.id]) {
        callback(checkUserRole(user, role));
    } else {
        require("./db.js").db.query("SELECT meta_value FROM "+settings.database.prefix+"usermeta WHERE meta_key = '"+settings.database.prefix+"capabilities' AND user_id = ?", [user.id], function(error, rows){
            if (error) {
                d.error("DATABASE ERROR - auth.js exports.userCan - "+error, "auth");
                return callback(false);
            }
            
            if (rows.length === 0) {
                return callback(false);
            }
            
            siteuserroles[user.id] = serial.unserialize(rows[0].meta_value);
            callback(checkUserRole(user, role));
        });
    }
}

function checkUserRole(user, role) {
    if (!siteuserroles[ user.id ]) return false;
    // loop through user roles
    for (var a in siteuserroles[ user.id ]) {
        if ( (siteroles[ a ]) && (siteroles[ a ].capabilities[ role ]) && (siteroles[ a ].capabilities[ role ] == 1) ) return true;
    }
    return false;
}

function fetchSiteRoles() {
    if ( Math.round(new Date().getTime() / 1000) > (lastSiteRoleFetch+300) ) {
        // fetch roles again
        require("./db.js").db.query("SELECT option_value FROM "+settings.database.prefix+"options WHERE option_name='"+settings.database.prefix+"user_roles'", function(error, rows){
            if (error){
                console.log('ERROR: ' + error);
                return;
            }
            siteroles = serial.unserialize(rows[0].option_value);
            siteuserroles = {};
        });
    }
    return siteroles;
}

fetchSiteRoles();
