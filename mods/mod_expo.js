var db = require("../db"),
    api = require("../api"),
    tools = require("../tools"),
    auth = require("../auth");
    
api.assign("expo2013/hatmsg", function(args, cb) {
    //if (!args.post) return cb({error: "Only POST requests allowed"});
    
    db.query("SELECT COUNT(1) AS n FROM expo2013_hats WHERE ip = ''", function(e, rows) {
        if (e) {
            console.log(e);
            return cb({error: e});
        }
        if (rows[0]['n'] > 0) {
            if (!args.headers.cookie) return cb({error: "Invalid entry"});
            var cookies = tools.cookieParse(args);
            
            if (!cookies.__expH) {
                // give the user a cookie :3
                var cookie = makeid(115);
                
                args.resheaders = {
                    "Set-Cookie": "__expH="+cookie+"; Domain=.alphazone4.com; Path=/; Expires=Wed, 09 Jun 2021 12:34:51 GMT"
                };
            }
            
            cb({success: "Continue below to redeem your own AlphaZone4 Hat for the American region of PlayStation Home."});
        } else {
            return cb({error: "Sorry, all codes are gone! :("});
        }
    });
    
});

api.assign("expo2013/hatget", function(args, cb) {
    if (!args.post) return cb({error: "Only POST requests allowed"});
    
    if (!args.headers) return cb({error: "No - your browser has non-standard plugins/features installed"});
    
    if (!args.headers.cookie) return cb({error: "Invalid entry - your browser does not support cookies"});
    
    if (!args.headers['user-agent']) return cb({error: "No such user - your browser is not returning a user-agent, disabling many standard website featured"});
    
    var cookies = tools.cookieParse(args);
    if (!cookies.__expH) return cb({error: "Invalid user entry - your browser does not support cookies"});
    
    if (cookies.__expH.length < 100) return cb({error: "Invalid user 2"});
    
    auth.getUserId(args, function(userid) {
        find_me_code(cookies.__expH, tools.getIP(args), userid, function(res) {
            if (res) {
                return cb(res);
            } else {
                // no?! new code :D
                db.query("UPDATE expo2013_hats SET `cookie` = ?, `ip` = ?, `time` = NOW(), `userID` = ?, `user-agent` = ? WHERE ip = '' ORDER BY RAND() LIMIT 1",
                [ cookies.__expH, tools.getIP(args), userid, args.headers['user-agent'] ],
                function(err, rows) {
                    if (err) {
                        return cb({error: "Unable to grab code :( "+err});
                    }
                    
                    find_me_code(cookies.__expH, tools.getIP(args), userid, function(res) {
                        if (res) {
                            return cb(res);
                        } else {
                            return cb({error: "Sorry, failed to find you a code :( please try again later or contact us!"});
                        }
                    });
                });
            }
        });
    });
    
    //cb({success: cookies});
});

function find_me_code(cookie, ip, userid, cb) {
    if (!userid) {
        db.query(
            "SELECT male, female FROM expo2013_hats WHERE cookie = ? AND time >= DATE_SUB(NOW(), INTERVAL 6 HOUR)",
            [cookie, ip],
            function(err, rows) {
                if (rows.length == 0) {
                    // anon, no code yet, get a new one
                    return cb(null);
                } else {
                    // user already got a code, return it to them! :)
                    return cb({
                        male: rows[0].male,
                        female: rows[0].female
                    });
                }
            }
        );
    } else {
        // logged in user, search for their code
        db.query("SELECT male, female FROM expo2013_hats WHERE userID = ?", [userid], function(err, rows) {
            if (rows.length == 0) {
                return cb(null);
            }
            
            return cb({
                male: rows[0].male,
                female: rows[0].female
            });
        });
    }
    
    
}

function makeid(len)
{
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for( var i=0; i < len; i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}