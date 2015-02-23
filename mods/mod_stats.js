var auth  = require("../auth"),
    stats = require("../stats"),
    api   = require("../api");
    
api.assign("/admin/stats/", function(args, cb) {
    // first, get user ID
    auth.getUserId(args, function(user_id) {
        if (!user_id) return cb({error: "Not authorised :("});
        
        if (auth.userCan(user_id, "install_plugins", function(e) {
            if (e) {
                stats.stats(args.inputs[0], args.query, cb);
            } else {
                return cb({error: "Not authorised :("});
            }
        })); 
    });
    
});