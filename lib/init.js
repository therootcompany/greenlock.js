'use strict';

var Init = module.exports;

var fs = require('fs');
var path = require('path');
//var promisify = require("util").promisify;

Init._init = function(opts) {
    //var Rc = require("@root/greenlock/rc");
    var Rc = require('./rc.js');
    var pkgText;
    var pkgErr;
    var msgErr;
    //var emailErr;
    var realPkg;
    var userPkg;
    var myPkg = {};
    // we want to be SUPER transparent that we're reading from package.json
    // we don't want anything unexpected
    var implicitConfig = [];
    var rc;

    if (opts.packageRoot) {
        try {
            pkgText = fs.readFileSync(
                path.resolve(opts.packageRoot, 'package.json'),
                'utf8'
            );
            opts._hasPackage = true;
        } catch (e) {
            pkgErr = e;
            if (opts._mustPackage) {
                console.error(
                    'Should be run from package root (the same directory as `package.json`)'
                );
                process.exit(1);
                return;
            }
            console.warn(
                '`packageRoot` should be the root of the package (probably `__dirname`)'
            );
        }
    }

    if (pkgText) {
        try {
            realPkg = JSON.parse(pkgText);
        } catch (e) {
            pkgErr = e;
        }
    }

    userPkg = opts.package;

    if (realPkg || userPkg) {
        userPkg = userPkg || {};
        realPkg = realPkg || {};

        // build package agent
        if (!opts.packageAgent) {
            // name
            myPkg.name = userPkg.name;
            if (!myPkg.name) {
                myPkg.name = realPkg.name;
                implicitConfig.push('name');
            }

            // version
            myPkg.version = userPkg.version;
            if (!myPkg.version) {
                myPkg.version = realPkg.version;
                implicitConfig.push('version');
            }
            if (myPkg.name && myPkg.version) {
                opts.packageAgent = myPkg.name + '/' + myPkg.version;
            }
        }

        // build author
        myPkg.author = opts.maintainerEmail;
        if (!myPkg.author) {
            myPkg.author =
                (userPkg.author && userPkg.author.email) || userPkg.author;
        }
        if (!myPkg.author) {
            implicitConfig.push('author');
            myPkg.author =
                (realPkg.author && realPkg.author.email) || realPkg.author;
        }
        if (!opts._init) {
            opts.maintainerEmail = myPkg.author;
        }
    }

    if (!opts.packageAgent) {
        msgErr =
            'missing `packageAgent` and also failed to read `name` and/or `version` from `package.json`';
        if (pkgErr) {
            msgErr += ': ' + pkgErr.message;
        }
        throw new Error(msgErr);
    }

    if (!opts._init) {
        opts.maintainerEmail = parseMaintainer(opts.maintainerEmail);
        if (!opts.maintainerEmail) {
            msgErr =
                'missing or malformed `maintainerEmail` (or `author` from `package.json`), which is used as the contact for support notices';
            throw new Error(msgErr);
        }
    }

    if (opts.packageRoot) {
        // Place the rc file in the packageroot
        rc = Rc._initSync(opts.packageRoot, opts.manager, opts.configDir);
        opts.configDir = rc.configDir;
        opts.manager = rc.manager;
    }

    if (!opts.configDir && !opts.manager) {
        throw new Error(
            'missing `packageRoot` and `configDir`, but no `manager` was supplied'
        );
    }

    opts.configFile = path.join(
        path.resolve(opts.packageRoot, opts.configDir),
        'config.json'
    );
    var config;
    try {
        config = JSON.parse(fs.readFileSync(opts.configFile));
    } catch (e) {
        if ('ENOENT' !== e.code) {
            throw e;
        }
        config = { defaults: {} };
    }

    opts.manager =
        rc.manager ||
        (config.defaults && config.defaults.manager) ||
        config.manager;
    if (!opts.manager) {
        opts.manager = '@greenlock/manager';
    }
    if ('string' === typeof opts.manager) {
        opts.manager = {
            module: opts.manager
        };
    }
    opts.manager = JSON.parse(JSON.stringify(opts.manager));

    var confconf = ['configDir', 'configFile', 'staging', 'directoryUrl'];
    Object.keys(opts).forEach(function(k) {
        if (!confconf.includes(k)) {
            return;
        }
        if ('undefined' !== typeof opts.manager[k]) {
            return;
        }
        opts.manager[k] = opts[k];
    });

    /*
    var ignore = ["packageRoot", "maintainerEmail", "packageAgent", "staging", "directoryUrl", "manager"];
    Object.keys(opts).forEach(function(k) {
        if (ignore.includes(k)) {
            return;
        }
        opts.manager[k] = opts[k];
    });
    */

    // Place the rc file in the configDir itself
    //Rc._initSync(opts.configDir, opts.configDir);
    return opts;
};

// ex: "John Doe <john@example.com> (https://john.doe)"
// ex: "John Doe <john@example.com>"
// ex: "<john@example.com>"
// ex: "john@example.com"
var looseEmailRe = /(^|[\s<])([^'" <>:;`]+@[^'" <>:;`]+\.[^'" <>:;`]+)/;
function parseMaintainer(maintainerEmail) {
    try {
        maintainerEmail = maintainerEmail.match(looseEmailRe)[2];
    } catch (e) {
        maintainerEmail = null;
    }

    return maintainerEmail;
}
