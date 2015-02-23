var api =   require("../api"),
    votes = require("../vote"),
    tools = require("../tools");

api.assign("vote", function(args, cb) {
    if (!args.inputs[0]) return cb({error: "No vote ID given"});
    
    if (!args.post) return cb({error: "Only POST requests allowed"});
    
    if (!args.post.vote) return cb({error: "Missing vote"});
    
    var vote_id, vote;
    try {
        vote_id = parseInt(args.inputs[0], 10);
        vote = parseInt(args.post.vote, 10);
    } catch(e) {
        return cb({error: "Failed to parse voting inputs"});
    }
    
    votes.vote(vote_id, vote, tools.getIP(args), cb);
    
    return false;
});