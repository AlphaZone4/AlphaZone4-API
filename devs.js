// load up some basic developer info
var db = require("./db"),
    settings = require("./settings"),
    dl = require("./dl"),
    sdat = require("./sdat"),
    config = require("./config"),
    fs = require("fs");

exports.updates = get_dev_updates;
exports.update_maker_logos = update_maker_logos;
exports.data = get_dev_info;

var devs = null;

// fetch devs list from settings
settings.devs(function(d) {
    devs = d.slugs;
});

// get some basic developer infos
function get_dev_info(dev, cb) {
    if (devs && !devs[dev]) return cb(false);
    
    db.query("SELECT COUNT(DISTINCT(i.id)) AS num FROM homestore_items AS i, homestore_itemlinks AS l WHERE l.item_id = i.id AND i.dev = ?", [dev], function(err, rows) {
        return cb({items: rows[0].num});
    });
}

function get_dev_updates(dev, cb) {
    if (devs && !devs[dev]) return cb(false);
    
    db.query("SELECT COUNT(1) AS item_num, l.update_id, u.name, u.type AS region "+
        "FROM homestore_items AS i "+
        "RIGHT JOIN homestore_updateitems AS l ON l.item_id = i.id "+
        "INNER JOIN homestore_updates AS u ON l.update_id = u.id "+
        "WHERE i.dev = ? "+
        "GROUP BY l.update_id "+
        "ORDER BY update_id DESC",
        [dev],
    function(err, rows) {
        cb(rows);
    });
}

function update_maker_logos(cb) {
    db.query("SELECT a.* FROM (SELECT code, tnum, dev FROM homestore_items WHERE dev != '' AND tnum >= 0 ORDER BY id DESC) AS a GROUP BY dev", function(err, rows) {
        var ret = [];
        
        var step = function() {
            var c = rows.shift();
            
            if (!c) {
                return cb(ret);
            } else {
                if (fs.existsSync(config.cdn_root+"/d/"+c.dev+".png")) {
                    return process.nextTick(step);
                }
                var u = config.scee_root+"Objects/"+c.code+"/maker"+sdat.tnum_string(c.tnum)+".png";
                dl.download_exist( u, function(e) {
                    if (e) {
                        dl.download(u, config.cdn_root+"/d/"+c.dev+".png", function(yay) {
                            ret.push({
                                dev: c.dev,
                                url: u,
                                icon: config.cdn_root+"/d/"+c.dev+".png"
                            });
                            process.nextTick(step);
                        });
                    } else {
                        process.nextTick(step);
                    }
                });
            }
        };
        
        process.nextTick(step);
    });
}

/*get_dev_updates("ndreams", function(a) {
    console.log(a);
});*/
