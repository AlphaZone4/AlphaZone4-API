// basic module to handle configuration merging etc.

exports.merge = function(def, conf) {
    for(var c in conf) {
        def[c] = conf[c];
    }
    return def;
};