'use strict';

var CLI = module.exports;

var defaultConf;
var defaultOpts;
var bags = [];

CLI.parse = function(conf) {
    var opts = (defaultOpts = {});
    defaultConf = conf;

    Object.keys(conf).forEach(function(k) {
        var v = conf[k];
        if (!v) {
            console.error(
                'Developer Error: missing cli flag definition for',
                JSON.stringify(k)
            );
            process.exit(1);
        }
        var aliases = v[5];
        var bag;
        var bagName;

        // the name of the argument set is now the 0th argument
        v.unshift(k);
        // v[0] flagname
        // v[1] short flagname
        // v[2] description
        // v[3] type
        // v[4] default value
        // v[5] aliases

        if ('bag' === v[3]) {
            bag = v[0]; // 'bag-option-xxxx' => '--bag-option-'
            bag = '--' + bag.replace(/xxx.*/, '');
            bags.push(bag);

            bagName = toBagName(bag.replace(/^--/, ''));
            opts[bagName] = {};
        }

        if ('json' === v[3]) {
            bagName = toBagName(v[0].replace(/-json$/, '')); // 'bag-option-json' => 'bagOptionOpts'
            opts[bagName] = {};
        } else if ('ignore' !== v[3] && 'undefined' !== typeof v[4]) {
            // set the default values (where 'undefined' is not an allowed value)
            opts[toCamel(k)] = v[4];
        }

        if (!aliases) {
            aliases = [];
        } else if ('string' === typeof aliases) {
            aliases = aliases.split(',');
        }
        aliases.forEach(function(alias) {
            if (alias in conf) {
                throw new Error(
                    "Cannot alias '" +
                        alias +
                        "' from '" +
                        k +
                        "': option already exists"
                );
            }
            conf[alias] = v;
        });
    });
};

CLI.main = function(cb, args) {
    var leftovers = [];
    var conf = defaultConf;
    var opts = defaultOpts;

    if (!opts) {
        throw new Error("you didn't call `CLI.parse(configuration)`");
    }

    // TODO what's the existing API for this?
    if (!args) {
        args = process.argv.slice(2);
    }

    var flag;
    var cnf;
    var typ;

    function grab(bag) {
        var bagName = toBagName(bag);
        if (bag !== flag.slice(0, bag.length)) {
            return false;
        }
        opts[bagName][toCamel(flag.slice(bag.length))] = args.shift();
        return true;
    }

    while (args.length) {
        // take one off the top
        flag = args.shift();

        // mind the gap
        if ('--' === flag) {
            leftovers = leftovers.concat(args);
            break;
        }

        // help!
        if (
            '--help' === flag ||
            '-h' === flag ||
            '/?' === flag ||
            'help' === flag
        ) {
            printHelp(conf);
            process.exit(1);
        }

        // only long names are actually used
        if ('--' !== flag.slice(0, 2)) {
            console.error("error: unrecognized flag '" + flag + "'");
            process.exit(1);
        }

        cnf = conf[flag.slice(2)];
        if (!cnf) {
            // look for arbitrary flags
            if (bags.some(grab)) {
                continue;
            }

            // other arbitrary args are not used
            console.error("unrecognized elided flag '" + flag + "'");
            process.exit(1);
        }

        // encourage switching to non-aliased version
        if (flag !== '--' + cnf[0]) {
            console.warn(
                "use of '" +
                    flag +
                    "' is deprecated, use '--" +
                    cnf[0] +
                    "' instead"
            );
        }

        // look for xxx-json flags
        if ('json' === cnf[3]) {
            try {
                var json = JSON.parse(args.shift());
                var bagName = toBagName(cnf[0].replace(/-json$/, ''));
                Object.keys(json).forEach(function(k) {
                    opts[bagName][k] = json[k];
                });
            } catch (e) {
                console.error("Could not parse option '" + flag + "' as JSON:");
                console.error(e.message);
                process.exit(1);
            }
            continue;
        }

        // set booleans, otherwise grab the next arg in line
        typ = cnf[3];
        // TODO --no-<whatever> to negate
        if (Boolean === typ || 'boolean' === typ) {
            opts[toCamel(cnf[0])] = true;
            continue;
        }
        opts[toCamel(cnf[0])] = args.shift();
        continue;
    }

    cb(leftovers, opts);
};

function toCamel(str) {
    return str.replace(/-([a-z0-9])/g, function(m) {
        return m[1].toUpperCase();
    });
}

function toBagName(bag) {
    // trim leading and trailing '-'
    bag = bag.replace(/^-+/g, '').replace(/-+$/g, '');
    return toCamel(bag) + 'Opts'; // '--bag-option-' => bagOptionOpts
}

function printHelp(conf) {
    var flagLen = 0;
    var typeLen = 0;
    var defLen = 0;

    Object.keys(conf).forEach(function(k) {
        flagLen = Math.max(flagLen, conf[k][0].length);
        typeLen = Math.max(typeLen, conf[k][3].length);
        if ('undefined' !== typeof conf[k][4]) {
            defLen = Math.max(
                defLen,
                '(Default: )'.length + String(conf[k][4]).length
            );
        }
    });

    Object.keys(conf).forEach(function(k) {
        var v = conf[k];

        // skip aliases
        if (v[0] !== k) {
            return;
        }

        var def = v[4];
        if ('undefined' === typeof def) {
            def = '';
        } else {
            def = '(default: ' + JSON.stringify(def) + ')';
        }

        var msg =
            ' --' +
            v[0].padEnd(flagLen) +
            ' ' +
            v[3].padStart(typeLen + 1) +
            ' ' +
            (v[2] || '') +
            ' ' +
            def; /*.padStart(defLen)*/
        // v[0] flagname
        // v[1] short flagname
        // v[2] description
        // v[3] type
        // v[4] default value
        // v[5] aliases

        console.info(msg);
    });
}
