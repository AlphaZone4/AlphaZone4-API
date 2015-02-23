// module for collecting API statistics
// inspired by http://blog.cloudno.de/website-statistics-using-nodejs-and-redis-40667

var cache   = require("./cache"),
    md5     = require("./md5");

// exports
exports.log     = log;
exports.stats   = stats;

// functions
function log(method, headers) {
    var ip = headers["x-real-ip"];
    var referer = headers.referer;
    var date = new Date();
    var month = (date.getUTCMonth() < 10 ? "0" : "") + (date.getUTCMonth() + 1);
    var year = date.getUTCFullYear();
    var day = year + "-" + month + "-" + (date.getUTCDate() < 10 ? "0" : "" ) + date.getUTCDate();
    var hour = (date.getHours() < 10 ? "0" : "") + date.getHours();
    var urlhash;

    var keys = [
        "hits-by-method:" + method,
        "hits-by-day:" + day,
        "hits-by-month:" + year + ":" + month,
        "hits-by-hour:" + day + ":" + hour,
        "hits-by-method-by-day:" + method + ':' + day,
        "hits-by-method-by-month:" + method + ':' + year + "-" + month, 
        "hits-by-ip:" + ip,
        "hits-by-ip-by-day:" + ip + ':' + day,
        "hits-by-day-of-week:" + date.getDay()
    ];

    if (referer) {
        urlhash = md5.hash(referer);
        keys.push("hits-by-url:" + urlhash); 
        keys.push("hits-by-url-by-day:" + urlhash + ":" + day);
        cache.set("url:" + urlhash, referer);
    }

    for (var i in keys) {
        cache.incr(keys[i]);
    }
}

function stats(key, args, cb) {
    if (key == "daily") {
        return _daily(args.start, args.finish, cb);
    } else if (key == "hourly") {
        return _hourly(args.start, args.finish, cb);
    }
    return cb([]);
}

function _daily(start, days, cb) {
    if (!start || !days) {
        // default to 3 weeks (why not)
        start = day();
        days = 7*3;
    }
    
    var fetch = [];
    fetch.push("hits-by-day:"+start);
    
    // make list of values to fetch
    for(var ii=1; ii<days; ii++) {
        fetch.push("hits-by-day:"+day(days_ago(ii)));
    }
    
    // call generic fetch stats function
    fetch_stats(fetch, function(d) {
        return cb({
            "xScale": "ordinal",
            "yScale": "linear",
            "main": [{
                "data": d
            }],
            /*"comp": [
                {
                    "type": "line-dotted",
                    "className": ".comp.errorBar",
                    "data": [
                        {"x":"2012-12-11","y":6923},{"x":"2012-12-10","y":425},{"x":"2012-12-09","y":7017},{"x":"2012-12-08","y":7143},{"x":"2012-12-07","y":7404},{"x":"2012-12-06","y":8917},{"x":"2012-12-05","y":2266},{"x":"2012-12-04","y":0}
                    ]
                },
                {
                    "type": "line-dotted",
                    "className": ".comp.errorBar",
                    "data": [
                        {"x":"2012-12-11","y":12923},{"x":"2012-12-10","y":425},{"x":"2012-12-09","y":7017},{"x":"2012-12-08","y":7143},{"x":"2012-12-07","y":7404},{"x":"2012-12-06","y":8917},{"x":"2012-12-05","y":2266},{"x":"2012-12-04","y":0}
                    ]
                },
            ]*/
        });
    });
}

function _hourly(start, hours, cb) {
    if (!start || !hours) {
        // default to 3 days (why not)
        start = hour();
        hours = 72;
    }
    
    var fetch = [];
    fetch.push("hits-by-hour:"+start);
    
    // make list of values to fetch
    for(var ii=1; ii<hours; ii++) {
        fetch.push("hits-by-hour:"+hour(hours_ago(ii)));
    }
    
    // call generic fetch stats function
    fetch_stats(fetch, function(d) {
        return cb({
            "xScale": "ordinal",
            "yScale": "linear",
            "main": [{
                "data": d
            }]
        });
    });
}

function fetch_stats(list, cb) {
    var ret = [];
    
    var fetcher = function() {
        var a = list.shift();
        
        if (a) {
            cache.get(a, function(err, d) {
                if (err) {
                    d.error("Error fetching API statistics: "+err, "stats");
                    return cb(false);
                } else {
                    var date = a.split(":");
                    date.splice(0, 1);
                    date = date.join(":");
                    
                    ret.push({
                        x: date,
                        y: d ? parseInt(d) : 0
                    });
                    
                    process.nextTick(fetcher);
                }
            });
        } else {
            // done! :D
            return cb(ret);
        }
    };
    
    process.nextTick(fetcher);
}

// get day from datetime object
function day(d) {
    if (!d) {
        d = new Date();
    }
    
    // check if Date object
    if (!d.getDate) {
        d = new Date(d);
    }
    
    var dd = (d.getDate() < 10 ? "0" : "") + d.getDate();
    var mm = d.getMonth()+1; //January is 0!
    if (mm < 10) mm = "0" + mm;
    var yyyy = d.getFullYear();
    
    return yyyy+"-"+mm+"-"+dd;
}

// get current hour from datetime object
function hour(d) {
    if (!d) {
        d = new Date();
    }
    
    // check if Date object
    if (!d.getDate) {
        d = new Date(d);
    }
    
    return day(d)+":"+(d.getHours() < 10 ? "0" : "")+d.getHours();
}

function days_ago(num) {
    if (!num) num = 0;
    
    var d = new Date() - (60000 * 60 * 24 * num);
    return d;
}

function hours_ago(num) {
    if (!num) num = 0;
    
    var d = new Date() - (60000 * 60 * num);
    return d;
}

if (!module.parent) {
    _hourly(false, false, function(d) {
        console.log(JSON.stringify(d, null, 2));
    });
}