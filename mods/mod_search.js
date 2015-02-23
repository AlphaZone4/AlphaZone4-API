var api     = require("../api"),
    search  = require("../search"),
    db      = require("../db");

// search/items/?{query}

api.assign("/search/items/", function(args, cb) {
    search.search(args.query, cb);
    
    // log this search query
    if (args.query.query) {
        var query = args.query.query.toLowerCase().replace(/(?:(?:^|\n)\s+|\s+(?:$|\n))/g,'').replace(/\s+/g,' ');
        db.query("INSERT INTO db_searches (search) VALUES (?)", [query]);
    }
});