'use strict';

var Flags = module.exports;

var path = require('path');
//var pkgpath = path.join(__dirname, '..', 'package.json');
var pkgpath = path.join(process.cwd(), 'package.json');
var GreenlockRc = require('./greenlockrc.js');

Flags.init = function() {
    return GreenlockRc(pkgpath).then(async function(rc) {
        var Greenlock = require('../');
        // this is a copy, so it's safe to modify
        rc._bin_mode = true;
        var greenlock = Greenlock.create(rc);
        var mconf = await greenlock.manager.defaults();

        var flagOptions = {
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
            servername: [
                false,
                'a name that matches a subject or altname',
                'string'
            ],
            servernames: [
                false,
                'a list of names that matches a subject or altname',
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
        };

        return {
            flagOptions,
            rc,
            greenlock,
            mconf
        };
    });
};

Flags.mangleFlags = function(flags, mconf) {
    if ('altnames' in flags) {
        flags.altnames = (flags.altnames || '').split(/[,\s]+/).filter(Boolean);
    }
    if ('servernames' in flags) {
        flags.servernames = (flags.servernames || '')
            .split(/[,\s]+/)
            .filter(Boolean);
    }

    Object.keys(flags).forEach(function(k) {
        if (flags[k] === mconf[k] && !flags.forceSave) {
            delete flags[k];
        }
    });

    var typ;
    var challenge;
    if (flags.challenge) {
        if (/http-01/.test(flags.challenge)) {
            typ = 'http-01';
        } else if (/dns-01/.test(flags.challenge)) {
            typ = 'dns-01';
        } else if (/tls-alpn-01/.test(flags.challenge)) {
            typ = 'tls-alpn-01';
        }

        challenge = flags.challengeOpts;
        challenge.module = flags.challenge;
        flags.challenges = {};
        flags.challenges[typ] = challenge;
        delete flags.challengeOpts;
        delete flags.challenge;

        var chall = mconf.challenges[typ];
        if (challenge.module === chall.module) {
            var keys = Object.keys(challenge);
            var same =
                !keys.length ||
                keys.every(function(k) {
                    return chall[k] === challenge[k];
                });
            if (same && !flags.forceSave) {
                delete flags.challenges;
            }
        }
    }

    delete flags.forceSave;
};
