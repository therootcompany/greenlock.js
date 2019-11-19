'use strict';

var args = process.argv.slice(3);
var cli = require('./lib/cli.js');
//var path = require('path');
//var pkgpath = path.join(__dirname, '..', 'package.json');
//var pkgpath = path.join(process.cwd(), 'package.json');

var Flags = require('./lib/flags.js');

Flags.init().then(function({ flagOptions, greenlock, mconf }) {
    var myFlags = {};
    [
        'subject',
        'altnames',
        'renew-offset',
        'subscriber-email',
        'customer-email',
        'server-key-type',
        'challenge-http-01',
        'challenge-http-01-xxxx',
        'challenge-dns-01',
        'challenge-dns-01-xxxx',
        'challenge-tls-alpn-01',
        'challenge-tls-alpn-01-xxxx',
        'challenge',
        'challenge-xxxx',
        'challenge-json',
        'force-save'
    ].forEach(function(k) {
        myFlags[k] = flagOptions[k];
    });

    cli.parse(myFlags);
    cli.main(function(argList, flags) {
        Flags.mangleFlags(flags, mconf);
        main(argList, flags, greenlock);
    }, args);
});

async function main(_, flags, greenlock) {
    if (!flags.subject || !flags.altnames) {
        console.error(
            '--subject and --altnames must be provided and should be valid domains'
        );
        process.exit(1);
        return;
    }

    greenlock
        .add(flags)
        .catch(function(err) {
            console.error();
            console.error('error:', err.message);
            console.error();
            process.exit(1);
        })
        .then(function() {
            return greenlock
                ._config({
                    servername:
                        flags.altnames[
                            Math.floor(Math.random() * flags.altnames.length)
                        ]
                })
                .then(function(site) {
                    if (!site) {
                        console.info();
                        console.info(
                            'Internal bug or configuration mismatch: No config found.'
                        );
                        console.info();
                        process.exit(1);
                        return;
                    }

                    console.info();
                    Object.keys(site).forEach(function(k) {
                        if ('defaults' === k) {
                            console.info(k + ':');
                            Object.keys(site.defaults).forEach(function(key) {
                                var value = JSON.stringify(site.defaults[key]);
                                console.info('\t' + key + ':' + value);
                            });
                        } else {
                            console.info(k + ': ' + JSON.stringify(site[k]));
                        }
                    });
                });
        });
}
