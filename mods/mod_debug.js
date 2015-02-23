// simply returns object of the arguments passed through API

var api = require("../api");

api.assign("/debug/", function(args, cb) {
    cb(args);
});