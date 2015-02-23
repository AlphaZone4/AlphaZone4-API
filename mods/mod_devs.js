var api = require("../api"),
    devs = require("../devs");

api.assign("get/releases", function(args, cb) {
    devs.updates(args.inputs[0], cb);
});

api.assign("get/dev", function(args, cb) {
    devs.data(args.inputs[0], cb);
});