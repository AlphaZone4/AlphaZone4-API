// settings
var settings = require("./config.js");

// legacy function
function init(cb){
    return cb(db);
}

var mysql = require('mysql');

var config = {
    user: settings.database.user,
    password: settings.database.pass,
    database: settings.database.name,
    socketPath: settings.database.sock
};

// setup connection object
var db = mysql.createConnection(config);

db.on('close', function(err) {
  if (err) {
    // We did not expect this connection to terminate
    db = mysql.createConnection(config);
  } else {
    // We expected this to happen, end() was called.
    //console.log("DATABASE CLOSED!");
  }
});

// ensure database is using UTF8 (this also initiates the connection)
db.query("set names 'utf8'");

exports.db = db;
exports.init = init;

// export all db functions
for(var ii in db) {
    exports[ii] = db[ii];
}