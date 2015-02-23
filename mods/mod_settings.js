var api = require("../api"),
    settings = require("../settings");

api.assign("/settings/", function(args, cb) {
    // ... fairly trivial
    // caching is complex, so is handled inside the function itself
    settings.get(args, cb);
});