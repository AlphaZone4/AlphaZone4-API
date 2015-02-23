// includes
var xmpp = require('simple-xmpp'),
    config = require("./config"),
    az4status = require("./status"),
    d   = require("./debug");

var online = false;

var users = {};

exports.send = send;
exports.probe = probe;

// configurable responses from chat bot
var regi = [
    // items
    {
        r: /item ([0-9]+)/,
        f: function(d, cb){
            require("./item.js").get(d[0], function(i){
                var h = ((i.name)?i.name:"(unknown)") + ((i.gender=="M")?" (Male)":((i.gender=="F")?" (Female)":""));
                h += "\n"+((i.description)?i.description+"\n":"");
                if (i.prices.GBP) h += " £"+i.prices.GBP;
                if (i.prices.EUR) h += " EUR"+i.prices.EUR;
                if (i.prices.USD) h += " $"+i.prices.USD;
                if (i.prices.JPY) h += " YEN"+i.prices.JPY;
                if (i.prices.HKD) h += " HK$"+i.prices.HKD;
                h += "\nhttp://cdn.alphazone4.com/"+((i.image_large_exist)?"l":"i")+"/"+i.image;
                cb(h);
            });
            return false; // important!
        }
    },
    // current status
    {
        r: /(^status|is Home (?:up|online|down|alive|dead|on|off))/i,
        f: function(d, cb){
            az4status.online(function(t) {
                cb("Home is "+( t ? "online" : "offline" ));
            });
        }
    }
];

// only run if config section exists
if (config.xmpp) {
    run();
}

// connect
function run() {
    xmpp.connect({
        jid: config.xmpp.username+"@"+config.xmpp.host,
        password: config.xmpp.password,
        host: config.xmpp.host,
        port: 5222
    });
    
    xmpp.getRoster();
              
    xmpp.on('online', function() {
        online = true;
        
        if (messages.length>0) {
            // we have messages in the queue! let's send them
            for(var m in messages) {
                send(messages[m].to, messages[m].message, messages[m].cb);
            }
            messages = [];
        }
    });
    
    // buddy alerts! :D
    xmpp.on('buddy', function(jid, state) {
        users[ jid ] = state;
    });
    
    // accept any friend requests! :D
    xmpp.on('subscribe', function(from) {
        d.debug(from + " is my new friend :D", "XMPP");
        xmpp.acceptSubscription(from);
        // subscribe back to the user
        xmpp.subscribe(from);
    });
    
    // delete people when they delete me :(
    xmpp.on('unsubscribe', function(from) {
        d.debug(from + " left me :'(", "XMPP");
        xmpp.acceptUnsubscription(from);
    });
    
    // reply to users
    xmpp.on('chat', function(from, message) {
        parse(message, function(reply){
            send(from, reply);
        });
    });
    
    // handle errors
    xmpp.on('error', function(e) {
        d.error(e, "XMPP");
        
        online = false;
        
        // relaunch
        process.nextTick(run);
    });
}

// === functions ===
var messages = [];
function send(to, message, cb) {
    if (online){
       xmpp.send(to, message);
       
       if(cb) cb();
    } else {
        // not online? push to list to send when we are
        messages.push({
            to: to,
            message: message,
            cb: cb
        });
    }
}

function probe(who, cb) {
    if (users[ who ]) {
        return cb({status: users[ who ]});
    } else {
        return cb({status: "offline"});
    }
}

var parse = function(msg, cb){
    for(var i in regi) {
        if (regi[i].r.test(msg)) {
            return regi[i].f( regi[i].r.exec(msg).slice(1), cb );
        }
    }
    cb("Sorry, I do not understand that command.");
};