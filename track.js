var db    = require("./db"),
    tools = require("./tools"),
    auth  = require("./auth");
    
exports.track = track;

var enable_tracking = true;

function track(args) {
    if (!enable_tracking) return;
    
    auth.getUserId(args, function(userid) {
        if (userid > 0) {
            // get username
            auth.ID2User(userid, function(user) {
                do_track(user.user_login, userid);
            });
        } else {
            do_track(tools.getIP(args), 0);
        }
    });
}

function do_track(id, userid) {
    db.query("SELECT id FROM az4_sftrack WHERE trackname = ?", [id], function(err, rows) {
        if (rows.length > 0) {
            db.query("UPDATE az4_sftrack SET trackdate=NOW(), forum_id=0, topic_id=0, pageview='itemdb' WHERE id = ?", [rows[0].id], function() {
                
            });
        } else {
            db.query("INSERT INTO az4_sftrack (trackuserid, trackname, forum_id, topic_id, trackdate, pageview) VALUES (?, ?, 0, 0, NOW(), 'itemdb')", [
                userid, id
            ], function() {
                
            });
        }
    });
}