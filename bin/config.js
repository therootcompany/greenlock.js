'use strict';

var args = process.argv.slice(3);
var cli = require('./cli.js');
//var path = require('path');
//var pkgpath = path.join(__dirname, '..', 'package.json');
//var pkgpath = path.join(process.cwd(), 'package.json');

var Flags = require('./flags.js');

Flags.init().then(function({ flagOptions, rc, greenlock, mconf }) {
    var myFlags = {};
    ['subject', 'servername' /*, 'servernames', 'altnames'*/].forEach(function(
        k
    ) {
        myFlags[k] = flagOptions[k];
    });

    cli.parse(myFlags);
    cli.main(function(argList, flags) {
        Flags.mangleFlags(flags, mconf);
        main(argList, flags, rc, greenlock, mconf);
    }, args);
});

async function main(_, flags, rc, greenlock /*, mconf */) {
    var servernames = [flags.subject]
        .concat([flags.servername])
        //.concat(flags.servernames)
        //.concat(flags.altnames)
        .filter(Boolean);
    delete flags.subject;
    delete flags.altnames;
    flags.servernames = servernames;
    if (flags.servernames.length > 1) {
        console.error('Error: should only have one servername');
        process.exit(1);
        return;
    } else if (flags.servernames.length !== 1) {
        console.error('Error: need a servername to check');
        process.exit(1);
        return;
    }
    flags.servername = flags.servernames[0];
    delete flags.servernames;

    greenlock
        ._config(flags)
        .catch(function(err) {
            console.error();
            console.error('error:', err.message);
            console.log(err.stack);
            console.error();
        })
        .then(function(site) {
            if (!site) {
                console.info();
                console.info('No config found for ');
                console.info();
                process.exit(1);
                return;
            }
            console.info();
            console.info(
                'Config for ' + JSON.stringify(flags.servername) + ':'
            );
            console.info(JSON.stringify(site, null, 2));
            console.info();
        });
}
