'use strict';

var args = process.argv.slice(3);
var cli = require('./lib/cli.js');
//var path = require('path');
//var pkgpath = path.join(__dirname, '..', 'package.json');
//var pkgpath = path.join(process.cwd(), 'package.json');

var Flags = require('./lib/flags.js');

Flags.init({ forceSave: true }).then(function({
    flagOptions,
    greenlock,
    mconf
}) {
    var myFlags = {};
    [
        'agree-to-terms',
        'account-key-type',
        'server-key-type',
        'subscriber-email',
        'renew-offset',
        'store',
        'store-xxxx',
        'challenge-http-01-xxxx',
        'challenge-dns-01',
        'challenge-dns-01-xxxx',
        'challenge-tls-alpn-01',
        'challenge-tls-alpn-01-xxxx',
        'challenge',
        'challenge-xxxx',
        'challenge-http-01'
    ].forEach(function(k) {
        myFlags[k] = flagOptions[k];
    });

    cli.parse(myFlags);
    cli.main(function(argList, flags) {
        Flags.mangleFlags(flags, mconf, null, { forceSave: true });
        main(argList, flags, greenlock);
    }, args);
});

async function main(_, flags, greenlock) {
    greenlock.manager
        .defaults(flags)
        .catch(function(err) {
            console.error();
            console.error('error:', err.message);
            //console.log(err.stack);
            console.error();
            process.exit(1);
        })
        .then(function() {
            return greenlock.manager.defaults();
        })
        .then(function(dconf) {
            console.info();
            console.info('Global config');
            console.info(JSON.stringify(dconf, null, 2));
        });
}
