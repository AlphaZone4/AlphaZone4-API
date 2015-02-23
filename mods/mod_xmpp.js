var api = require("../api"),
    request = require("request"),
    xml2js  = require("xml2js");
    
api.assign("chat/user", function(args, cb) {
    if (!args.inputs[0]) return cb({error: "No user supplied."});
    
    request("http://bind.psho.me/online/"+args.inputs[0]+"/psho.me/xml", function(err, res, body) {
        xml2js.parseString(body, function(err, obj) {
            if (!obj.presence.resource || obj.presence.resource.length === 0) {
                // offline
                return cb({jabber_resources:[{
                    show:'unavailable',
                    long_show:'unavailable',
                    status:'offline',
                    image:'http://bind.psho.me/online/'+obj.presence["$"].user+'/psho.me/avatar'
                }]});
            } else {
                var u = obj.presence.resource[0]["$"];
                
                return cb({jabber_resources:[{
                    show:u.show,
                    long_show:u.show,
                    status:u.show,
                    image:'http://bind.psho.me/online/'+obj.presence["$"].user+'/psho.me/avatar'
                }]});
            }
        });
    });
});