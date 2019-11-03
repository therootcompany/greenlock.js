'use strict';

var args = process.argv.slice(3);
var cli = require('./cli.js');
var Flags = require('./flags.js');

Flags.init().then(function({ flagOptions, rc, greenlock, mconf }) {
    var myFlags = {};
    [
        'subject',
        'altnames',
        'renew-offset',
        'server-key-type',
        'challenge',
        'challenge-xxxx',
        'challenge-json',
        'force-save'
    ].forEach(function(k) {
        myFlags[k] = flagOptions[k];
    });

    cli.parse(myFlags);
    cli.main(function(argList, flags) {
        main(argList, flags, rc, greenlock, mconf);
    }, args);
});

async function main(_, flags, rc, greenlock, mconf) {
    if (!flags.subject || !flags.altnames) {
        console.error(
            '--subject and --altnames must be provided and should be valid domains'
        );
        process.exit(1);
        return;
    }

    Flags.mangleFlags(flags, mconf);

    greenlock.update(flags).catch(function(err) {
        console.error();
        console.error('error:', err.message);
        console.error();
    })        .then(function() {
            return greenlock
                ._config({ servername: flags.subject })
                .then(function(site) {
                    if (!site) {
                        console.info();
                        console.info('No config found for ');
                        console.info();
                        process.exit(1);
                        return;
                    }
                    console.info();
                    console.info("Updated config!");
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
                    console.info();
                });
        });
}
