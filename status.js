// modules
var cache   = require("./cache"),
    d       = require("./debug"),
    xmpp    = require("./xmpp"),
    config  = require("./config");

// configuration
var cache_key = "online";

// exports
exports.online  = online;
exports.set     = set;

// cache status locally for a bit of ease
var home_status = true;
online(function(a) {
    home_status = a;
});

// is Home online?
function online(cb) {
    cache.get(cache_key, function(err, data) {
        if (err) {
            d.error("Failed to get Home status: "+err, "status");
            return cb(true);
        }
        
        home_status = ( data == "true" ) ? true : false;
        
        return cb(home_status);
    });
}

function set(onoroff) {
    if (home_status != onoroff) {
        // update local variable to stop spam notifications
        home_status = onoroff;
        
        // status has changed, send alerts!
        for(var ii=0; ii<config.xmpp.alerts.online.length; ii++){
            xmpp.send(
                config.xmpp.alerts.online[ii],
                "The AlphaZone4 scanner is reporting that Home is now "+ ((home_status) ? "back online" : "offline" )
            );
        }
    }
    
    // set redis flag
    cache.set(cache_key, onoroff);
}
