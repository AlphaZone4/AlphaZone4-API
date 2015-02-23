// Basic SphinxQL database handler. Implements pooling too.

var mysql        = require('mysql'),
    generic_pool = require('generic-pool'),
    d            = require("./debug");

// exports

exports.query = query;

// configuration

var config = {
    user: "test",
    password: "testpass",
    database: "test",
    host: "localhost",
    port: "9306"
};

// functions 

var pool = generic_pool.Pool({
    name: 'mysql',
    max: 6,
    create: function(callback) {
        var c = mysql.createConnection(config);
        
        c.connect();
        
        c.on('error', function(e) {
            d.warn("Oh dear."+e, "sphinx");
            c.end();
            pool.destroyAllNow();
        });
        
        callback(null, c);
    },
    destroy: function(db) {
        db.end();
    }
});


function query(_query, args, cb) {
    pool.acquire(function(err, db) {
        if (err) {
            d.error(JSON.stringify(err, null, 2), "sphinx");
            return cb({error: "Internal database error. This has been logged and will be investigated shortly."});
        } else {
            db.query(_query, args, function(err, rows, cols) {
                cb(err, rows, cols);
                
                // release db back into pool
                pool.release(db);
            });
        }
    });
}

// unit test
if (!module.parent) {
    query("SELECT * FROM items LIMIT 1", function(err, rows) {
        d.debug(rows, "sphinx");
    });
}
