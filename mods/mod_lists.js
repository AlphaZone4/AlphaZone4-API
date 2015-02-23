var api     = require("../api"),
    cache   = require("../cache"),
    d       = require("../debug"),
    lists   = require("../lists"),
    auth    = require("../auth");
    
api.assign("get/list/", function(args, cb) {
    if (!args.inputs[0]) return cb({error: "No list key supplied."});
    
    lists.get(args.inputs[0], cb);
});

api.assign("get/lists/", function(args, cb) {
    auth.getUserId(args, function(user_id) {
        if (user_id > 0) {
            return lists.user_get(user_id, cb);
        } else {
            return cb({error: "You must be logged in to see your lists."});
        }
    });
});