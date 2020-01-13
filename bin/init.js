'use strict';

var P = require('../plugins.js');
var args = process.argv.slice(3);
var cli = require('./lib/cli.js');
var Greenlock = require('../');

var Flags = require('./lib/flags.js');

var flagOptions = Flags.flags();
var myFlags = {};
[
    'config-dir',
    'maintainer-email',
    'cluster',
    'manager',
    'manager-xxxx'
].forEach(function(k) {
    myFlags[k] = flagOptions[k];
});

cli.parse(myFlags);
cli.main(async function(argList, flags) {
    var pkgRoot = process.cwd();
    var manager = flags.manager;

    if (['fs', 'cloud'].includes(manager)) {
        manager = '@greenlock/manager';
    }
    if (['cloud'].includes(manager)) {
        flags.managerOpts.cloud = true;
    }

    flags.manager = flags.managerOpts;
    delete flags.managerOpts;
    flags.manager.module = manager;

    try {
        if ('.' === String(manager)[0]) {
            manager = require('path').resolve(pkgRoot, manager);
        }
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

    var greenlock = Greenlock.create({
        packageRoot: pkgRoot,
        manager: flags.manager,
        configDir: flags.configDir,
        maintainerEmail: flags.maintainerEmail,
        _mustPackage: true
    });
    await greenlock.manager.defaults();

    //writeGreenlockJs(pkgdir, flags);
    writeServerJs(pkgRoot, flags);
    writeAppJs(pkgRoot);

    /*
    rc._bin_mode = true;
    var Greenlock = require('../');
    // this is a copy, so it's safe to modify
    var greenlock = Greenlock.create(rc);
    var mconf = await greenlock.manager.defaults();
    var flagOptions = Flags.flags(mconf, myOpts);
    */
}, args);

/*
function writeGreenlockJs(pkgdir, flags) {
    var greenlockJs = 'greenlock.js';
    var fs = require('fs');
    var path = require('path');
    var tmpl = fs.readFileSync(
        path.join(__dirname, 'tmpl/greenlock.tmpl.js'),
        'utf8'
    );

    try {
        fs.accessSync(path.join(pkgdir, greenlockJs));
        console.warn("[skip] '%s' exists", greenlockJs);
        return;
    } catch (e) {
        // continue
    }

    if (flags.maintainerEmail) {
        tmpl = tmpl.replace(
            /pkg.author/g,
            JSON.stringify(flags.maintainerEmail)
        );
    }
    fs.writeFileSync(path.join(pkgdir, greenlockJs), tmpl);
    console.info("created '%s'", greenlockJs);
}
*/

function writeServerJs(pkgdir, flags) {
    var serverJs = 'server.js';
    var fs = require('fs');
    var path = require('path');
    var tmpl;

    try {
        fs.accessSync(path.join(pkgdir, serverJs));
        console.warn("[skip] '%s' exists", serverJs);
        return;
    } catch (e) {
        // continue
    }

    if (flags.cluster) {
        tmpl = fs.readFileSync(
            path.join(__dirname, 'tmpl/cluster.tmpl.js'),
            'utf8'
        );
        tmpl = tmpl.replace(/cluster: false/g, 'cluster: true');
    } else {
        tmpl = fs.readFileSync(
            path.join(__dirname, 'tmpl/server.tmpl.js'),
            'utf8'
        );
    }

    if (flags.maintainerEmail) {
        tmpl = tmpl
            .replace(/pkg.author/g, JSON.stringify(flags.maintainerEmail))
            .replace(/\/\/maintainerEmail/g, 'maintainerEmail');
    }

    fs.writeFileSync(path.join(pkgdir, serverJs), tmpl);
    console.info("created '%s'", serverJs);
}

function writeAppJs(pkgdir) {
    var appJs = 'app.js';
    var fs = require('fs');
    var path = require('path');
    var tmpl = fs.readFileSync(
        path.join(__dirname, 'tmpl/app.tmpl.js'),
        'utf8'
    );

    try {
        fs.accessSync(path.join(pkgdir, appJs));
        console.warn("[skip] '%s' exists", appJs);
        return;
    } catch (e) {
        fs.writeFileSync(path.join(pkgdir, appJs), tmpl);
        console.info("created '%s'", appJs);
    }
}
