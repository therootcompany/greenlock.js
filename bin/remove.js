'use strict';

var args = process.argv.slice(3);
var cli = require('./lib/cli.js');
//var path = require('path');
//var pkgpath = path.join(__dirname, '..', 'package.json');
//var pkgpath = path.join(process.cwd(), 'package.json');

var Flags = require('./lib/flags.js');

Flags.init().then(function({ flagOptions, greenlock, mconf }) {
    var myFlags = {};
    ['subject'].forEach(function(k) {
        myFlags[k] = flagOptions[k];
    });

    cli.parse(myFlags);
    cli.main(function(argList, flags) {
        Flags.mangleFlags(flags, mconf);
        main(argList, flags, greenlock);
    }, args);
});

async function main(_, flags, greenlock) {
    if (!flags.subject) {
        console.error('--subject must be provided as a valid domain');
        process.exit(1);
        return;
    }

    greenlock
        .remove(flags)
        .catch(function(err) {
            console.error();
            console.error('error:', err.message);
            //console.log(err.stack);
            console.error();
            process.exit(1);
        })
        .then(function(site) {
            if (!site) {
                console.info();
                console.info('No config found for', flags.subject);
                console.info();
                process.exit(1);
                return;
            }
            console.info();
            console.info(
                'Deleted config for ' + JSON.stringify(flags.subject) + ':'
            );
            console.info(JSON.stringify(site, null, 2));
            console.info();
        });
}
