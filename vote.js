// use tools
var ts  = require("./tools"),
    d   = require("./debug"),
    db  = require("./db");
    
// exports
exports.fetch   = fetch;
exports.vote    = vote;
exports.cache   = cacheItem;

// functions
function fetch(slugid, cb) {
    if (isNaN(slugid)) {
        // we have a slug!
        fetchRatingSlug(slugid, cb);
    } else {
        // we have an ID!
        fetchRating(slugid, cb);
    }
}

function fetchRatingSlug(slug, cb) {
    var rating = {};
    require("./db.js").db.query("SELECT r.id AS rating_id, COUNT(1) AS total, FORMAT(AVG(vote), 2) AS rating FROM home_votes AS v, home_ratings AS r WHERE r.id = v.rating_id AND r.slug = ?", [slug], function(error, rows) {
        if (rows[0].total > 0) {
            // we have a rating (and thus the rating_id)
            rating.rating = rows[0].rating;
            rating.votes = rows[0].total;
            rating.rating_id = rows[0].rating_id;
            cb(rating);
        } else {
            // we don't have any votes (and thus no rating_id)
            require("./db.js").db.query("SELECT id FROM home_ratings WHERE slug = ?", [slug], function(error, rows) {
                    if (error){
                        d.error("Error occured with fetchRatingSlug (2): "+error, "vote");
                        return cb(false);
                    }
                    
                    rating.rating = 0;
                    rating.votes = 0;
                    
                    if (!rows.length) {
                        // crap, item hasn't got a rating... :|
                        // lets make one then! :D
                        db.query("INSERT IGNORE INTO home_ratings (slug) VALUES (?)", [slug], function(err, res) {
                            if (err) {
                                d.error("Error creating new rating for "+slug, "vote");
                                return cb(false);
                            }
                            
                            rating.rating_id = res.insertId;
                            cb(rating);
                        });
                    }else{
                        rating.rating_id = rows[0].id;
                        cb(rating);
                    }
            });
        }
    });
    return false;
}

function fetchRating(id, cb) {
    var rating = {};
    require("./db.js").db.query("SELECT rating_id, COUNT(1) AS total, FORMAT(AVG(vote), 2) AS rating FROM home_votes WHERE rating_id = ?", [id], function(error, rows){
        if (error) {
            d.error("Failed to fetch rating fetchRating: "+error);
            return cb(false);
        }
        
        if (rows[0].total>0) {
            // we have a rating (and thus the rating_id)
            rating.rating = rows[0].rating;
            rating.votes = rows[0].total;
            rating.rating_id = rows[0].id;
            cb(rating);
        } else {
            rating.rating = 0;
            rating.votes = 0;
            rating.rating_id = id;
            cb(rating);
        }
    });
    return false;
}

var regex_itemslug = /item_([0-9]*)/;

function vote(vote_id, rating, ip, cb) {
	require("./db.js").db.query("SELECT * FROM home_ratings WHERE id = ? LIMIT 1", [vote_id], function(error, rows){
        if (error) {
            d.error("Failed to fetch vote for "+vote_id+" (IP: "+ip+")", "vote");
            return cb(false);
        }
        
        if (rows.length === 0) {
            return cb({message: "No such vote ID", success: false});
        }
        
        if (!ip) ip = "NULL"; // TODO - deal with this!
        
        require("./db.js").db.query("INSERT INTO `home_votes` (`rating_id`, `ip`, `vote`) VALUES (?, ?, ?);", [vote_id, ip, rating], function(error){
            fetchRating(rows[0].id, function(data) {
                if (error) {
                    // some item voting debug stuff
                    if (regex_itemslug.test(rows[0].slug)) {
                        var itemid = rows[0].slug.match(regex_itemslug);
                        d.info("[IP "+ip+"] Failed to vote for item ID "+itemid[1]+" with rating "+rating, "vote");
                    }
                    
                    return cb({
                        message: "You have already voted!",
                        success: false
                    });
                }
                
                data.message = "Thank you for your vote!";
                data.success = true;
                
                // is this an item rating? cache it!
                if (regex_itemslug.test(rows[0].slug)) {
                    var itemid = rows[0].slug.match(regex_itemslug);
                    cacheItem(itemid[1]);
                    
                    d.info("[IP "+ip+"] Successfully voted for item ID "+itemid[1]+" with rating "+rating, "vote");
                }
                
                cb(data);
            });
        });
    });
    return false;
}

function _cacheItem(item, rating, vote, cb) {
    require("./db.js").db.query("UPDATE homestore_items SET cvotes = ?, crating = ? WHERE id = ?", [vote, rating, item], function(error){
        // cool, we cached it
        if (error) console.log("Vote cache fail! "+error);
        if (cb) cb();
    });
}

function cacheItem(item, rating, votes, cb) {
    if (!rating || !votes){
        // no cached data was supplied, fetch first
        if (typeof(item.rating)!="undefined"){
            // we've been passed a full item object!
            fetchRating(item.rating, function(r){
                _cacheItem(item.id, r.rating, r.votes, cb);
            });
        }else{
            // just item ID, fetch by slug
            fetchRatingSlug("item_"+item, function(r){
                _cacheItem(item, r.rating, r.votes, cb);
            });
        }
    }else{
        // have been given cached data, cache it now.
        _cacheItem(item, rating, votes, cb);
    }
}
