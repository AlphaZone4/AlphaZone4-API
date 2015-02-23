// API methods for making new methods etc.
//  creates a "method tree", will return furthest method upon searching
//
//  assign(url, func)
//      assign url to given function
//      eg. assign("get/cat/", function(){});
//
//  find(url)
//      find method and arguments from URL
//      eg. find("/get/cat/1");
//      returns: {method: [function], args: ['1']}

var d     = require("./debug"),
    URL   = require("url"),
    stats = require("./stats"),
    track = require("./track");

var methods = {
};

function url_split(url) {
    return url.replace(/^\/+|\/+$/g, '').split("/");
}

function assign(url, func) {
    // strip starting/trailing slashes
    url = url.replace(/^\/+|\/+$/g, '');
    
    // split part into pieces
    var path = url_split(url);
    
    // add sections to methods if they don't exist yet
    var m = methods;
    if ( (path.length == 1) && (path[0] === "") ) {
        // edge case for root methods
        m = methods;
    } else {
        
        for(var ii=0; ii<path.length; ii++) {
            if (!m[ path[ii] ]) {
                m[ path[ii] ] = {};
            }
            m = m[ path[ii] ];
        }
    }
    
    // check if method already exists
    if (!m._method) {
        d.info("Added new API method "+url, "api");
        m._method    = func;
        m._url       = url; // keep original URL nicename
    } else {
        d.warn("Tried to add duplicate method "+url, "api");
    }
}

function run(url, req, cb) {
    // parse URL first
    var comp = URL.parse(url, true); // true parses query string to an object
    
    // grab method
    var m = find(comp.pathname);
    
    if (m) {
        // fill in args object
        m.args.query        = comp.query;
        m.args.headers      = req.headers; // pass entire request object too
        m.args.url          = req.url;
        m.args.method       = req.method;
        
        // if this is a POST request, store the POST object
        if (req.method == 'POST') {
            m.args.post = req.body;
        }
        
        // run method and pass on callback
        try {
            // log some statistics
            stats.log(m.url, m.args.headers);
            
            // call actual function
            return m.method(m.args, function(data) {
                // return data along with function arguments
                cb(data, m.args);
                
                track.track(m.args);
            });
        } catch(err) {
            var msg = "";
            if (typeof err === 'object') {
                if (err.message) {
                    msg += 'Message: ' + err.message;
                }
                if (err.stack) {
                    msg += err.stack;
                }
            } else {
                msg += 'dumpError :: argument is not an object';
            }
            d.error(msg, "api");
            cb({error: "Internal error. This has been logged and will be investigated. Thank you. "}, {});
        }
    } else {
        return cb({error: "No such method found"});
    }
}

function find(url) {
    var method; // method we're aiming to return non-null
    var _url;
    var args = {inputs: []};
    
    // split part into pieces
    var path = url_split(url);
    
    // check for root method first
    if (methods._method) {
        method = methods._method;
        args = {inputs: []};
    }
    
    // now search through the tree
    var m = methods;
    for(var ii=0; ii<path.length; ii++) {
        // jump up the tree
        m = m[ path[ii] ];
        
        // reached the end of the module tree? break
        if (!m) break;
        
        // found a potential method
        if (m && m._method) {
            method = m._method;
            _url = m._url;
            args.inputs = path.slice(ii+1);
        }
    }
    
    // return object with function and arguments
    return {
        method: method,
        url   : _url,
        args  : args
    };
}

// exports
exports.assign  = assign;
exports.run     = run;