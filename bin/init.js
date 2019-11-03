'use strict';

var P = require('../plugins.js');
var args = process.argv.slice(3);
var cli = require('./lib/cli.js');
//var path = require('path');
//var pkgpath = path.join(__dirname, '..', 'package.json');
//var pkgpath = path.join(process.cwd(), 'package.json');

var Flags = require('./lib/flags.js');

var flagOptions = Flags.flags();
var myFlags = {};
['maintainer-email', 'cluster', 'manager', 'manager-xxxx'].forEach(function(k) {
    myFlags[k] = flagOptions[k];
});

cli.parse(myFlags);
cli.main(async function(argList, flags) {
    var path = require('path');
    var pkgpath = path.join(process.cwd(), 'package.json');
    var pkgdir = path.dirname(pkgpath);
    //var rcpath = path.join(pkgpath, '.greenlockrc');
    var configFile = path.join(pkgdir, 'greenlock.d/manager.json');
    var manager = flags.manager;

    // TODO move to bin/lib/greenlockrc.js
    if (!manager) {
        manager = 'greenlock-cloud-fs';
        if (!flags.managerOpts.configFile) {
            flags.managerOpts.configFile = configFile;
        }
    }
    if (['fs', 'cloud'].includes(manager)) {
        // TODO publish the 1st party modules under a secure namespace
        flags.manager = '@greenlock/manager-' + flags.manager;
    }
    flags.manager = flags.managerOpts;
    delete flags.managerOpts;
    flags.manager.manager = manager;

    try {
        P._loadSync(manager);
    } catch (e) {
        try {
            P._installSync(manager);
        } catch (e) {
            console.error(
                'error:',
                JSON.stringify(manager),
                'could not be loaded, and could not be installed.'
            );
            process.exit(1);
        }
    }

    var GreenlockRc = require('./lib/greenlockrc.js');
    //var rc = await GreenlockRc(pkgpath, manager, flags.manager);
    await GreenlockRc(pkgpath, manager, flags.manager);
    writeServerJs(pkgdir, flags);
    writeAppJs(pkgdir);

    /*
    rc._bin_mode = true;
    var Greenlock = require('../');
    // this is a copy, so it's safe to modify
    var greenlock = Greenlock.create(rc);
    var mconf = await greenlock.manager.defaults();
    var flagOptions = Flags.flags(mconf, myOpts);
    */
}, args);

function writeServerJs(pkgdir, flags) {
    var serverJs = 'server.js';
    var bakTmpl = 'server-greenlock-tmpl.js';
    var fs = require('fs');
    var path = require('path');
    var tmpl = fs.readFileSync(
        path.join(__dirname, 'tmpl/server.tmpl.js'),
        'utf8'
    );

    try {
        fs.accessSync(path.join(pkgdir, serverJs));
        console.warn(
            JSON.stringify(serverJs),
            ' exists, writing to ',
            JSON.stringify(bakTmpl),
            'instead'
        );
        serverJs = bakTmpl;
    } catch (e) {
        // continue
    }

    if (flags.cluster) {
        tmpl = tmpl.replace(
            /options.cluster = false/g,
            'options.cluster = true'
        );
    }
    if (flags.maintainerEmail) {
        tmpl = tmpl.replace(
            /pkg.author/g,
            JSON.stringify(flags.maintainerEmail)
        );
    }
    fs.writeFileSync(path.join(pkgdir, serverJs), tmpl);
}

function writeAppJs(pkgdir) {
    var bakTmpl = 'app-greenlock-tmpl.js';
    var appJs = 'app.js';
    var fs = require('fs');
    var path = require('path');
    var tmpl = fs.readFileSync(
        path.join(__dirname, 'tmpl/app.tmpl.js'),
        'utf8'
    );

    try {
        fs.accessSync(path.join(pkgdir, appJs));
        console.warn(
            JSON.stringify(appJs),
            ' exists, writing to ',
            JSON.stringify(bakTmpl),
            'instead'
        );
        appJs = bakTmpl;
    } catch (e) {
        // continue
    }

    fs.writeFileSync(path.join(pkgdir, appJs), tmpl);
}
