// Main AlphaZone4 API Endpoint

var config  = require("./config"),
    connect = require("connect"),
    d       = require("./debug"),
    fs      = require("fs"),
    URL     = require("url"),
    api     = require("./api");
    
// let's start this! :D
//  load mods first
load_mods(function() {
    start_server();
});

// ======= functions =======

// hot-loads mods
function load_mods(cb) {
    fs.readdir(__dirname+"/mods/", function(err, mods) {
        if (err) {
        } else {
            d.info("Loading server mods", "index");
            // load each module
            for(var ii=0; ii<mods.length; ii++) {
                if (mods[ii].indexOf(".js", mods[ii].length - 3) == -1) continue;

                // load the module
                var t = require(__dirname+"/mods/"+mods[ii]);
                
                // check if we can skip config
                var conf = {};
                if (t.req_config) {
                    if (fs.existsSync(__dirname+"/configs/"+mods[ii])) {
                        // load config
                        conf = require(__dirname+"/configs/"+mods[ii]);
                    } else {
                        // no config for mod that requires it :(
                        d.warn(" Skipping mod "+mods[ii]+" - no config file", "index");
                        continue; // skip over this loop
                    }
                }
                
                // run module (if method exists)
                if (t.run) t.run(conf);
            }
            
            // callback to continue loading
            if (cb) cb();
        }
    });
}

function start_server() {
    d.info("Starting AlphaZone4 Webserver", "index");
    d.info("  Port: "+config.server.port, "index");
    
    var app = connect();
    
    app.use(connect.favicon("static/favicon.ico")); // use favicon
    
    // override remote-addr token for nginx ip forwarding
    connect.logger.token('remote-addr', function(req){ return req.headers['x-real-ip']; });
    app.use(connect.logger('[WEB] :remote-addr - - [:date] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"')); // log API requests
    //app.use(connect.logger(server_log)); // log API requests to function
    
    app.use(connect['static']('static')); // serve static files
    
    // accept POST data in request body
    app.use(connect.bodyParser());
    
    // respond to requests
    app.use(function(req, res) {
        api.run(req.url, req, function(data, args) {
            server_reply(data, res, req, args);
        });
    });
    
    // listen
    try {
        app.listen(config.server.port);
    } catch(e) {
        console.log(e);
    }

    // start scanner
    require("./scanner").init();
}

function server_reply(data, res, req, args) {
    // res headers
    var headers = {};
    if (args.resheaders) headers = args.resheaders;
    
    // set headers, ensure UTF-8 is enabled for Japanese characters etc.
    //  set type to text/plain for debug, as sometimes browsers download JS files
    headers['Content-Type'] = ((config.debug || args.plain) ? "text/plain" : "text/javascript")+"; charset=UTF-8";
    
    // send header
    if (args.status) {
        res.writeHead(args.status, headers);
    } else {
        res.writeHead(200, headers);
    }
    
    // parse URL
    var comp = URL.parse(req.url, true);

    if (args.plain) {
        res.end(data, 'utf-8');
    } else {
        // check for JSONP allowance and print
        if (!args.nojsonp && comp.query.callback) {
            res.end(((args.blocked)?"for (;;);":"")+comp.query.callback.replace(/[^a-zA-Z0-9\,\-\_]/g, '')+"("+JSON.stringify(data)+");", "utf8");
        } else {
            res.end(JSON.stringify(data), 'utf-8');
        }
    }
}
