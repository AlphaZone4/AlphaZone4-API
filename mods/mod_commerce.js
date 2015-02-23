var api = require("../api"),
    db = require("../db"),
    updates = require("../updates");

api.assign("/commerce/latest/", function(args, cb) {
    if (!args.inputs[0]) return cb({error: "No parameters"});

    // get latest data
    var date = updates.latest();

    updates.update(date, args.inputs[0], function(update_id) {
        db.query("SELECT i.code FROM `homestore_updateitems` AS u, `homestore_items` AS i WHERE u.item_id = i.id AND u.update_id = ?", [update_id], function(err, items) {
            if (err) {
                return cb({error: err});
            }

            var codes = [];
            for(var i=0; i<items.length; i++) {
                codes.push(items[i].code);
            }
            args.plain = true;
            cb(getXML(codes));
        });
    });
});

function getXML(items) {
    var h = "<commerce_point>\n\t<node type=\"objects\">\n\t\t<header>\n\t\t\t"+
            "<name lane=\"en-GB\" default=\"true\">Items</name>\n\t\t\t"+
            "<thumbnail lang=\"en-GB\" default=\"true\">http://cdn.alphazone4.com/h/cubehouse.jpg</thumbnail>"+
            "\n\t\t</header>";

    for(var i=0; i<items.length; i++) {
        h += "\n\t\t<object>"+items[i]+"</object>";
    }

    h += "\n\t</node>\n</commerce_point>";
    return h;
}
