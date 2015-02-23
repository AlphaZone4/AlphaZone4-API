// special root dir method that will catch all non-existant methods :)

var api = require(__dirname+"/../api");

api.assign("/", function(args, cb) {
    cb({error: "Sorry, function does not exist"});
});