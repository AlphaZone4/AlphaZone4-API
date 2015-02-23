/*
Where should the AlphaZone4 API run?
*/
exports.server = {
   port: 2100,
   scanner: 8764
};

/*
 Hash function details for turning Home item codes into AZ4 images
*/
exports.hash = {
    pre: "",
    post: ""
};
exports.hash_space = {
    pre: "",
    post: ""
};
exports.hash_avatar = {
    pre  : "",
    post:  ""
};

/*
AlphaZone4 Specifics
*/
exports.cdn_root = "/var/www/vhosts/cdn";
exports.filetype = "text/javascript";
exports.cache = 300; // cache timeout in seconds
exports.verbose = 3; // verbosityness
exports.cdn_web = "//cdn.alphazone4.com";

exports.scee_root = "http://scee-home.playstation.net/c.home/prod2/live2/";

/*
mySQL database settings
*/
exports.database = {
    host: "localhost",
    post: "3306",
    name: "alphazone4",
    pass: "changeme",
    sock: "mysql.sock",
    prefix: "wp_"
};
/*
Wordpress cookie (usually md5(sitename))
*/
exports.cookie = "";
exports.logged_in_key = "";
exports.logged_in_salt = "";


/*
to disable memcached:
exports.memcached = false;
*/
exports.memcached = {
    port: 11211,
    server: "localhost"
};

// psn code bot profiles
//exports.psn_profiles = {};

/*
Debug?
*/
exports.debug = false;

/*
XMPP config for bot
*/
// uncomment to activate
/*exports.xmpp = {
    host: "psho.me",
    username: "user",
    password: "pass",
    alerts: {
        online: [
            "cubehouse@psho.me"
        ]
    }
};*/

/*
Etherpad settings
*/
/*
exports.docs = {
    host    :"",
    port    :"",
    api_key :"",
    group   :""
};*/
