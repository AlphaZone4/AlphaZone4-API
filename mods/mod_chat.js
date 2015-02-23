var api = require("../api"),
    xmpp = require("../xmpp");

api.assign("chat/online", function(args, cb) {
    if (!args.inputs[0]) return cb({error: "No user supplied"});
    
    var user = args.inputs[0];
    
    // remove anything after an @ symbol
    user = user.replace(/@.*$/g, "");
    
    if (!user) return cb({error: "Invalid user supplied"});
    
    // append @psho.me to username and send probe
    xmpp.probe(user + "@psho.me", cb);
});