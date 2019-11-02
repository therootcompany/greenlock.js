'use strict';

var args = process.argv.slice(3);
var cli = require('./cli.js');
var path = require('path');
//var pkgpath = path.join(__dirname, '..', 'package.json');
var pkgpath = path.join(process.cwd(), 'package.json');

require('./greenlockrc')(pkgpath).then(async function(rc) {
    var Greenlock = require('../');
    // this is a copy, so it's safe to modify
    rc._bin_mode = true;
    var greenlock = Greenlock.create(rc);
    var mconf = await greenlock.manager.defaults();

    cli.parse({
        subject: [
            false,
            'the "subject" (primary domain) of the certificate',
            'string'
        ],
        altnames: [
            false,
            'the "subject alternative names" (additional domains) on the certificate, the first of which MUST be the subject',
            'string'
        ],
        'renew-offset': [
            false,
            "time to wait until renewing the cert such as '45d' (45 days after being issued) or '-3w' (3 weeks before expiration date)",
            'string',
            mconf.renewOffset
        ],
        'server-key-type': [
            false,
            "either 'RSA-2048' or 'P-256' (ECDSA) - although other values are technically supported, they don't make sense and won't work with many services (More bits != More security)",
            'string',
            mconf.serverKeyType
        ],
        challenge: [
            false,
            'the name name of file path of the HTTP-01, DNS-01, or TLS-ALPN-01 challenge module to use',
            'string',
            Object.keys(mconf.challenges)
                .map(function(typ) {
                    return mconf.challenges[typ].module;
                })
                .join(',')
        ],
        'challenge-xxxx': [
            false,
            'an option for the chosen challenge module, such as --challenge-apikey or --challenge-bucket',
            'bag'
        ],
        'challenge-json': [
            false,
            'a JSON string containing all option for the chosen challenge module (instead of --challenge-xxxx)',
            'json',
            '{}'
        ],
        'force-save': [
            false,
            "save all options for this site, even if it's the same as the defaults",
            'boolean',
            false
        ]
    });

    // ignore certonly and extraneous arguments
    async function main(_, options) {
        if (!options.subject || !options.altnames) {
            console.error(
                '--subject and --altnames must be provided and should be valid domains'
            );
            process.exit(1);
            return;
        }
        options.altnames = options.altnames.split(/[,\s]+/);

        Object.keys(options).forEach(function(k) {
            if (options[k] === mconf[k] && !options.forceSave) {
                delete options[k];
            }
        });

        var typ;
        var challenge;
        if (options.challenge) {
            if (/http-01/.test(options.challenge)) {
                typ = 'http-01';
            } else if (/dns-01/.test(options.challenge)) {
                typ = 'dns-01';
            } else if (/tls-alpn-01/.test(options.challenge)) {
                typ = 'tls-alpn-01';
            }

            challenge = options.challengeOpts;
            challenge.module = options.challenge;
            options.challenges = {};
            options.challenges[typ] = challenge;
            delete options.challengeOpts;
            delete options.challenge;

            var chall = mconf.challenges[typ];
            if (challenge.module === chall.module) {
                var keys = Object.keys(challenge);
                var same =
                    !keys.length ||
                    keys.every(function(k) {
                        return chall[k] === challenge[k];
                    });
                if (same && !options.forceSave) {
                    delete options.challenges;
                }
            }
        }

        delete options.forceSave;

        /*
        console.log('manager conf:');
        console.log(mconf);
        console.log('cli options:');
        console.log(options);
        */

        greenlock.add(options).catch(function(err) {
            console.error();
            console.error('error:', err.message);
            console.error();
        });
    }

    cli.main(main, process.argv.slice(3));
});
