// defines Item Database prices

exports.fields = get_fields;
exports.settings = price_settings;
exports.region_prices = region_prices;

// auto-price configs
var auto = {
    gbp2eur: {
        
    }
};

// configure prices here (these will also be sent to the client)
var prices = [
    {
        tag: "GBP",
        name: "&pound;",
        field: "price",
        regions: ["en-GB"]
    },
    {
        tag: "EUR",
        name: "&euro;",
        field: "euros",
        regions: ["de-DE", "fr-FR"]
    },
    {
        tag: "USD",
        name: "&dollar;",
        field: "dollars",
        regions: ["en-US"]
    },
    {
        tag: "YEN",
        name: "&yen;",
        field: "yen",
        regions: ["jp-JP"]
    },
    {
        tag: "HKD",
        name: "HK&dollar;",
        field: "hkdollars"
    },
    {
        tag: "AUD",
        name: "AUD&dollar;"
    },
    {
        tag: "LKWD",
        name: "LKWD Tokens",
        special: true
    },
    {
        tag: "MDP",
        name: "ModPoints",
        special: true
    },
    {
        tag: "JNG",
        name: "Juggernaut Coins",
        special: true
    },
    {
        tag: "STROP",
        name: "S-Tropical",
        special: true
    },
    {
        tag: "RYO",
        name: "Ryo",
        special: true
    },
    {
        tag: "V3D",
        name: "VEEMEE Tokens",
        special: true
    },
    {
        tag: "ACRN",
        name: "VEEMEE Acorns",
        special: true
    },
    {
        tag: "DLTT",
        name: "DL Trade Tokens",
        special: true
    },
    {
        tag: "GiftBx",
        name: "Giftinator Bucks",
        special: true
    },
    {
        tag: "CRWN",
        name: "LKWD Crowns",
        special: true
    },
    {
        tag: "GZT",
        name: "Granzella Tokens",
        special: true
    }
];

// return mapping of tag -> database field
var fields;
function get_fields() {
    if (fields) return fields;
    
    var t = {};
    
    var ii;
    for(ii=0; ii<prices.length; ii++) {
        if (prices[ii].field) {
            t[ prices[ii].tag ] = prices[ii].field;
        } else {
            t[ prices[ii].tag ] = prices[ii].tag;
        }
    }
    
    fields = t;
    
    return fields;
}


var nice_prices;
function price_settings() {
    if (nice_prices) return nice_prices;
    
    var t = {};
    
    var ii;
    for(ii=0; ii<prices.length; ii++) {
        t[ prices[ii].tag ] = {
            name: prices[ii].name,
            special: (prices[ii].special) ? true : false,
            field: (prices[ii].field) ? prices[ii].field : prices[ii].tag
        };
    }
    
    nice_prices = t;
    
    return nice_prices;
}

function region_prices() {
    // build list of locales to prices
    var res = {};
    
    for(var ii=0; ii<prices.length; ii++) {
        if (prices[ii].regions) {
            for(var jj=0; jj<prices[ii].regions.length; jj++) {
                res[prices[ii].regions[jj]] = prices[ii];
            }
        }
    }
    
    return res;
}

function auto_price(prices) {
    if (prices.GBP && !prices.EUR) {
        // GBP -> EUR auto-convert
        
    }
}
