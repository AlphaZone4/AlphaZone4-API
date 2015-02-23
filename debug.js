// debug/printing module

var config  = require("./config"),
    clc     = require("cli-color"),
    xmpp    = require("./xmpp");

// names
var names = {
    0: "ERROR",
    1: "WARN",
    2: "INFO",
    3: "DEBUG"
};

// colours
var colours = {
    0: clc.red.bold,
    1: clc.yellow,
    2: clc.blue,
    3: clc.cyan
};

function write(msg, type, log) {
    if (typeof(msg) != "string") {
        msg = JSON.stringify(msg, null, 2);
    }
    
    if (config.verbose >= log) {
        console.log("["+colours[log](names[log])+((type)?" "+type:"")+"]\t"+time()+"\t"+msg);
    }
}

function time() {
    var ct = new Date();
    return ""+(ct.getMonth()+1) + "/" + ct.getDate() + "/" + ct.getFullYear() + " " + time_str(ct.getHours()) + ":" + time_str(ct.getMinutes());
}

function time_str(a) {
    if (a<10) return "0"+a;
    return a;
}

exports.error = function(msg, type) {
    write(msg, type, 0);
    // also message Cubehouse about the error (SPAME)
    xmpp.send("cubehouse@psho.me", "[Error] "+msg);
};
exports.warn = function(msg, type) {
    write(msg, type, 1);
};
exports.info = function(msg, type) {
    write(msg, type, 2);
};
exports.debug = function(msg, type) {
    write(msg, type, 3);
};
// export time function as it's quite handy
exports.time = time;
