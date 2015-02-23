// include sphinx lib
// SELECT * FROM test1 WHERE MATCH('hat') AND price BETWEEN 0.0 AND 0.5 ORDER BY price DESC LIMIT 5;
// edit /etc/sphinxsearch/sphinx.conf
var sphinxql    = require("./sphinxdb.js"),
    cats        = require("./cats"),
    item        = require("./item"),
    settings    = require("./settings"),
    d           = require("./debug");

// configuration
var max_results = 400;

// TODO - Move this to item.js
var prices = {
    "GBP": "price",
    "USD": "dollars",
    "EUR": "euros",
    "JPY": "yen",
    "HKD": "hkdollars",
    "AUD": "AUD",
    "LKWD": "LKWD"
};

// exports

exports.search  = search;
    
// setup enums etc.

var item_types = item.types();
var item_enum = {};
for(var ii=0; ii<item_types.length; ii++) {
    item_enum[ item_types[ii] ] = ii + 1;
}

// dev list
var devs = {};
var devs_enum = {};
// euch, callback... it'll only take a second tho...
settings.devs(function (d) {
    for(var ii in d.list) {
        var a = parseInt(ii, 10);
        devs_enum[ d.list[ii].slug ] = a;
        devs[a] = d.list[ii].slug;
    }
});

// sort out region enums
var regions_enum = {};
var tmp = 0;
for(var a in cats.regions()) {
    tmp += 1;
    regions_enum[ a ] = tmp;
}

var gender_enum = {
    "M": 1,
    "F": 2
};
var gender_types = {
    1: "M",
    2: "F"
};

function fixFloat(i) {
    if (i.indexOf(".") == -1) return i+".";
    return i;
}

// functions

function search(args, cb) {
    var start_time = new Date().getTime();
    _search(args, function(data) {
        if (!data || data.error) {
            console.log(data.error);
            if (data.error) {
                return cb(data);
            } else {
                return cb({error: "Internal error :("});
            }
        } else if (data.length) {
            // fix gender and types
            for(var ii=0; ii<data.length; ii++) {
                data[ii].type = item_types[ data[ii].type-1 ];
                data[ii].gender = gender_types[ data[ii].gender ];
                data[ii].dev = devs[ data[ii].dev ];
            }
            
            // work out search time
            var search_time = new Date().getTime() - start_time;
            // reset search timing
            start_time = new Date().getTime();
            
            var result = [];
            for(var ii=0; ii<data.length; ii++) {
                var temp = item.get_basic(data[ii]);
                temp.cold_load = true;
                result.push(temp);
            }
            
            return cb({
                items: result,
                data_time: new Date().getTime() - start_time,
                search_time: search_time,
                results: result.length
            });
            
            // get full item data
            // TODO: Get search speed etc.?
           /*item.gets_data(data, function(d) {
                // work out item data time
                
                cb({
                    items: d,
                    data_time: new Date().getTime() - start_time,
                    search_time: search_time
                });
            });*/
        } else {
            return cb({error: "No items found :("});
        }
    });
}

function _sort_input(input, type) {
    if (!input) return false;
    
    // split array
    if (input.indexOf(",") >= 0) {
        input = input.split(",");
    }
    
    // ensure this is an array
    input = [].concat( input );
    
    // if no type supplied, just return
    if (!type) return input;
    
    var ii;
    if (type == "int") {
        // we should have ints, parse them
        for(ii=0; ii<input.length; ii++) {
            if (isNaN(input[ii])) return false;
            input[ii] = parseInt(input[ii], 10);
        }
    } else if (type == "float") {
         for(ii=0; ii<input.length; ii++) {
            if (isNaN(input[ii])) return false;
            input[ii] = parseFloat(input[ii], 10);
        }
    }
    
    return input;
}

function _search(args, cb) {
    var query = "SELECT * FROM items WHERE ";
    
    var where = [];
    var vals = [];
    
    // build a quick shortcut function
    var _add_simple_var = function(input, name, type) {
        input = _sort_input(input, type);
        
        if (input) {
            var sql_marks = [];
            for(var ii=0; ii<input.length; ii++) {
                sql_marks.push("?");
                vals.push(input[ii]);
            }
            
            if (sql_marks.length) where.push("`"+name+"` IN (" + sql_marks.join(", ") + ")");
        }
    };
    
    var _add_enum_var = function(input, name, _enum, type) {
        input = _sort_input(input, type);
        
        if (input) {
            var sql_marks = [];
            for(var ii=0; ii<input.length; ii++) {
                var a = _enum[ input[ii] ];
                if (a) {
                    sql_marks.push("?");
                    vals.push(a);
                }
            }
            
            if (sql_marks.length) where.push("`"+name+"` IN (" + sql_marks.join(", ") + ")");
        }
    };
    
    var _add_OR_var = function(input, name, type) {
        input = _sort_input(input, type);
        
        if (input) {
            var sql_marks = [];
            for(var ii=0; ii<input.length; ii++) {
                sql_marks.push("`"+name+"` = ?");
                vals.push(input[ii]);
            }
            
            if (sql_marks.length) where.push("" + sql_marks.join(" OR ") + "");
        }
    };
    
    // name must be at least this value
    var _add_min_var = function(input, name, type) {
        input = _sort_input(input, type);
        
        if (input && input.length == 1) {
            vals.push(input[0]);
            if (type == "float" && Math.round(input[0]) == input[0]) {
                where.push("`"+name+"` >= ?.0");
            } else {
                where.push("`"+name+"` >= ?");
            }
        }
    };
    
    // name must be at least this value
    var _add_max_var = function(input, name, type) {
        input = _sort_input(input, type);
        
        if (input && input.length == 1) {
            vals.push(input[0]);
            if (type == "float" && Math.round(input[0]) == input[0]) {
                where.push("`"+name+"` <= ?.0");
            } else {
                where.push("`"+name+"` <= ?");
            }
        }
    };
    
    // build query
    if (args.query) {
        where.push("MATCH(?)");
        vals.push(args.query);
    }
    
    // item type
    _add_enum_var(args.type, "type", item_enum);
    
    // item gender
    _add_enum_var(args.gender, "gender", gender_enum);
    
    // item regions
    _add_enum_var(args.regions, "zone", regions_enum);
    
    // item developer
    if (args.dev) {
        args.dev = args.dev.split(",");
        _add_enum_var(args.dev, "dev", devs_enum);
    }
    
    // furniture slots
    _add_min_var(args.min_slots, "slots", "int");
    _add_max_var(args.max_slots, "slots", "int");
    
    // prices
    for(var ii in prices) {
        _add_min_var(args['min_'+ii], prices[ii], "float");
        _add_max_var(args['max_'+ii], prices[ii], "float");
    }

    // search for specific store update years
    _add_simple_var(args.eu_year, "eu_year", "int");
    _add_simple_var(args.us_year, "us_year", "int");
    _add_simple_var(args.jp_year, "jp_year", "int");
    _add_simple_var(args.hk_year, "hk_year", "int");
    
    _add_simple_var(args.year, "year", "int");
    
    // check query was cool
    if (!where.length) {
        return cb({error: "No parameters passed"});
    }
    
    // BUILD. LIVE! LIIIVE!!!
    query += where.join(" AND ");
    
    // sort out pagnation
    if (!args.page) {
        args.page = 0;
    }
    
    var results_per_page = max_results;
    
    var start = (results_per_page*args.page);
    
    query += " limit "+start+","+(start+results_per_page);
    
    sphinxql.query(query, vals, function(err, rows) {
        if (err) {
            /*d.error("Invalid search query: "+JSON.stringify({
                query: query,
                values: vals
            }), "search");*/
            return cb({error: "Invalid search syntax"});
        }
        cb(rows);
    });
}

if (!module.parent) {
    search({
        query: "Homelings",
        type: ['Chead', 'Ctorso'],
        regions: ["eu"],
        gender: ["F", "M"],
        eu_year: [2011, 2009, 2012],
        us_year: 2012,
    }, function(data) {
        console.log(data);
    });
}
