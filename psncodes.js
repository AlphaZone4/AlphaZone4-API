// this is a Node.JS module to discover what a PSN code redeems to
// requires phantomJS to be installed

// e.g use: psncode.checkCodes("EU", ["CODE-CODE-CODE"], function(data) {});

// exports
exports.search = codeSearch;
exports.check = checkCodes;
exports.close = close;

var debug = true;

// config
var res_x = 800;
var res_y = 600;
var user_agent = "Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/30.0.1599.17 Safari/537.36";

var phantom = require('phantom');

var config = {
    "eu": {
        username: "",
        password: ""
    },
    "us": {
        username: "",
        password: ""
    },
};

function close() {
    if (ph) {
        ph.exit();

        ph = null;
    }
}

// check a region for a list of codes
function checkCodes(region, codes, cb) {
    if (!codes.length) return cb(false);

    if (!config[region]) return cb(false);

    // login!
    PSNLogin(region, function(page) {
        // check each code
        var res = [];

        var step = function() {
            var c = codes.shift();

            if (!c) {
                page.close();

                return cb(res);
            }

            PSNRedeemCode(page, c, function(result) {
                res.push(result);

                process.nextTick(step);
            });
        };

        process.nextTick(step);
    });
}

// search all regions for the redeem code
function codeSearch(code, cb) {
    var regions = [];
    for(var r in config) {
        regions.push(r);
    }

    var step = function() {
        var c = regions.shift();

        if (!c) {
            // ran out of regions :(
            return cb(false);
        }

        PSNLogin(c, function(page) {
            PSNRedeemCode(page, code, function(result) {
                // close page immediately, no longer need it
                page.close();

                if (!result.error) {
                    // we found it!
                    return cb(result);
                }

                process.nextTick(step);
            });
        });
    };

    process.nextTick(step);
}

// phantomJS obj
var ph;

var ph_lastLogin = "";

function getPhantom(cb) {
    if (ph) {
        return cb(ph);
    } else {
        if (debug) console.log("Booting up PhantomJS...\n");

        phantom.create("--web-security=no", "--ignore-ssl-errors=yes", "--proxy=address=localhost:9050", "--proxy-type=socks5", function(_ph) {
            ph = _ph;

            return cb(ph);
        });
    }
}

function PSNLogin(login, cb) {
    getPhantom(function(ph) {
        if (debug) console.log("Opening new tab for "+login+"...");

        ph_lastLogin = login;

        ph.createPage(function(page) {
            // set page configs
            page.set('viewportSize', {width: res_x, height: res_y});
            page.set('settings.userAgent', user_agent);

            if (debug) console.log("\n=== Login Form ===");
            page.open("https://account.sonyentertainmentnetwork.com/liquid/login.action", function(status) {
                if (status == "success") {
                    if (debug) console.log("Login form loaded. Evaluating...");

                    // catch new page after form submission
                    page.set('onLoadFinished', function () {
                        shot(page, "loginsubmitted");

                        if (debug) console.log("Login page submitted!");

                        // unset watcher
                        page.set('onLoadFinished', function() {});

                        if (cb) {
                            cb(page);
                        }
                    });

                    page.evaluate(function(config) {
                        var loginForm = document.getElementById("signInForm");

                        loginForm.elements["j_username"].value = config.username;
                        loginForm.elements["j_password"].value = config.password;

                        loginForm.submit();

                        return {};
                    }, function() {
                        shot(page, "loginform");

                        if (debug) console.log("Login page filled in. Submitting...");
                    }, config[ login ]);
                } else {
                    if (debug) console.log("Failed to load login page.");

                    return cb({error: "Login failed"});
                }
            });
        });
    });
}

function PSNRedeemCode(page, code, cb) {
    if (split_code(code) === false) {
        return cb({
            error: "Invalid redeem code",
            region: ph_lastLogin,
            code: code
        });
    }

    if (debug) console.log("\n=== Code Redeem Page For "+code+" ===");
    page.open("https://account.sonyentertainmentnetwork.com/liquid/cam/account/giftcard/redeem-gift-card-flow.action", function(status) {
        if (status == "success") {
            if (debug) console.log("Loaded redeem code page.");

            // catch redeem popup
            page.set('onLoadFinished', function () {
                // wait for page to properly load... (mainly error messages)
                setTimeout(function() {
                    shot(page, code + "_redeemcodepopup");

                    if (debug) console.log("Redeem Code form submitted!");

                    // unset watcher
                    page.set('onLoadFinished', function() {});

                    // parse for items
                    PSNRedeemCodeParse(page, function(data) {
                        data.code = code;

                        // give items a nice name too
                        if (data.items && data.items.length > 0) {
                            for(var i=0; i<data.items.length; i++) {
                                data.items[i].nice_name = name_tidy(
                                    data.items[i].name,
                                    data.items[i].dev
                                );
                            }
                        }

                        data.region = ph_lastLogin;

                        // before callback, cancel this form
                        page.evaluate(function() {
                            var cancel = document.getElementById("redeemGiftCardCancelLink");
                            if (cancel && cancel.click) cancel.click();
                        }, function() {
                            if (cb) {
                                cb(data);
                            }
                        });
                    });
                }, 2000);
            });

            page.evaluate(function(code) {
                document.getElementById("voucherCode1").value = code[0];
                document.getElementById("voucherCode2").value = code[1];
                document.getElementById("voucherCode3").value = code[2];

                document.getElementById("submitGiftCardForm").submit();
            }, function(result) {
                shot(page, code + "_redeemcodepage");

                if (debug) console.log("Redeem Code page loaded, submitting form...");
            }, split_code(code));
        } else {
            if (debug) console.log("Failed to load redeem code page.");
        }
    });
}

function PSNRedeemCodeParse(page, cb) {
    page.evaluate(function() {
        var res = {items: []};

        var err = document.getElementById("errorDivMessage");

        var scripts = document.getElementsByTagName( 'script' );

        // hax.
        var addErrorMSGAZ4 = function(t, msg) {
            res.error = msg;
        };

        res.scripts = [];
        for(var i=0; i<scripts.length; i++) {
            if (/addInlineActionError/g.test(scripts[i].innerText)) {
                res.scripts.push(scripts[i].innerText);
                var f = scripts[i].innerText.replace(/addInlineActionError/g, "addErrorMSGAZ4");
                res.f = f;
                eval(f);
            }
        }

        if (!res.error) {
            var items = document.getElementsByClassName("drmDetailProductTitleSection");

            for(var i=0; i<items.length; i++) {
                var obj = {};

                // parse this item
                var c = items[i].children;
                for(var j=0; j<c.length; j++) {
                    if(c[j].tagName == "H4")
                    {
                        // item name
                        obj.name = c[j].innerText;
                    }
                    else if (c[j].id == "providerName")
                    {
                        // developer
                        obj.dev = c[j].innerText;
                    }
                }

                res.items.push(obj);
            }
        }

        return res;
    }, function(result) {
        cb(result);
    });
}

function shot(page, name) {
    page.render("renders/"+ph_lastLogin+"/"+name+".png");
}

function pad(n, width, z) {
  z = z || '0';
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

var regex_code = /([a-zA-Z0-9]{4})-([a-zA-Z0-9]{4})-([a-zA-Z0-9]{4})/;
function split_code(code) {
    code = code.toUpperCase();
    var r = regex_code.exec(code);
    // double check this is a valid code
    if (r && r[1] && r[2] && r[3] && r[3].length == 4) {
        return [
            r[1], r[2], r[3]
        ];
    } else {
        return false;
    }
}

function name_tidy(name, dev) {
    if (!name || !dev) {
        return "error fetching code title";
    }
    // make it a bit neater
    name = name.replace(" (OBJECT)", "");
    name = name.replace(" (Object)", "");
    name = name.replace(" (Voucher)", "");
    dev  = dev.replace(" LLP", "");
    dev  = dev.replace(", LLC", "");
    
    return name + " ("+dev+")";
}

// debug
if (!module.parent) {
    checkCodes("eu", [
        "KLEA-D7NB-JDT4",
        "22CG-QBBB-JTC6",
        "96T5-28N7-GF7M",
        "M64H-KKN2-GJR9"
    ], function(data) {
        console.log(JSON.stringify(data, null, 2));

        close();
    });
}
