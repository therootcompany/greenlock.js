'use strict';

var Flags = module.exports;

//var path = require('path');
var pkgRoot = process.cwd();
//var Init = require('../../lib/init.js');

// These are ALL options
// The individual CLI files each select a subset of them
Flags.flags = function(mconf, myOpts) {
    // Current Manager Config
    if (!mconf) {
        mconf = {};
    }

    // Extra Override Options
    if (!myOpts) {
        myOpts = {};
    }

    return {
        all: [
            false,
            'search all site configs rather than by --subject or --servernames',
            'boolean'
        ],
        'agree-to-terms': [
            false,
            "agree to the Let's Encrypts Subscriber Agreement and Greenlock Terms of Use",
            'boolean'
        ],
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
        cluster: [false, 'initialize with cluster mode on', 'boolean', false],
        'renew-offset': [
            false,
            "time to wait until renewing the cert such as '45d' (45 days after being issued) or '-3w' (3 weeks before expiration date)",
            'string',
            mconf.renewOffset
        ],
        'customer-email': [
            false,
            "the email address of the owner of the domain or site (not necessarily the Let's Encrypt or ACME subscriber)",
            'string'
        ],
        'subscriber-email': [
            false,
            "the email address of the Let's Encrypt or ACME Account subscriber (not necessarily the domain owner)",
            'string'
        ],
        'config-dir': [
            false,
            'the directory in which config.json and other config and storage files should be written',
            'string'
        ],
        'maintainer-email': [
            false,
            'the maintainance contact for security and critical bug notices',
            'string'
        ],
        'account-key-type': [
            false,
            "either 'P-256' (ECDSA) or 'RSA-2048'  - although other values are technically supported, they don't make sense and won't work with many services (More bits != More security)",
            'string',
            mconf.accountKeyType
        ],
        'server-key-type': [
            false,
            "either 'RSA-2048' or 'P-256' (ECDSA) - although other values are technically supported, they don't make sense and won't work with many services (More bits != More security)",
            'string',
            mconf.serverKeyType
        ],
        store: [
            false,
            'the module name or file path of the store module to use',
            'string'
            //mconf.store.module
        ],
        'store-xxxx': [
            false,
            'an option for the chosen store module, such as --store-apikey or --store-bucket',
            'bag'
        ],
        manager: [
            false,
            'the module name or file path of the manager module to use',
            'string',
            '@greenlock/manager'
        ],
        'manager-xxxx': [
            false,
            'an option for the chosen manager module, such as --manager-apikey or --manager-dburl',
            'bag'
        ],
        challenge: [
            false,
            'the module name or file path of the HTTP-01, DNS-01, or TLS-ALPN-01 challenge module to use',
            'string',
            ''
            /*
                Object.keys(mconf.challenges)
                    .map(function(typ) {
                        return mconf.challenges[typ].module;
                    })
                    .join(',')
                */
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
        'challenge-http-01': [
            false,
            'the module name or file path of the HTTP-01 to add',
            'string'
            //(mconf.challenges['http-01'] || {}).module
        ],
        'challenge-http-01-xxxx': [
            false,
            'an option for the chosen challenge module, such as --challenge-http-01-apikey or --challenge-http-01-bucket',
            'bag'
        ],
        'challenge-dns-01': [
            false,
            'the module name or file path of the DNS-01 to add',
            'string'
            //(mconf.challenges['dns-01'] || {}).module
        ],
        'challenge-dns-01-xxxx': [
            false,
            'an option for the chosen challenge module, such as --challenge-dns-01-apikey or --challenge-dns-01-bucket',
            'bag'
        ],
        'challenge-tls-alpn-01': [
            false,
            'the module name or file path of the DNS-01 to add',
            'string'
            //(mconf.challenges['tls-alpn-01'] || {}).module
        ],
        'challenge-tls-alpn-01-xxxx': [
            false,
            'an option for the chosen challenge module, such as --challenge-tls-alpn-01-apikey or --challenge-tls-alpn-01-bucket',
            'bag'
        ],
        'force-save': [
            false,
            "save all options for this site, even if it's the same as the defaults",
            'boolean',
            myOpts.forceSave || false
        ]
    };
};

Flags.init = async function(myOpts) {
    var Greenlock = require('../../');

    // this is a copy, so it's safe to modify
    var greenlock = Greenlock.create({
        packageRoot: pkgRoot,
        _mustPackage: true,
        _init: true,
        _bin_mode: true
    });
    var mconf = await greenlock.manager.defaults();
    var flagOptions = Flags.flags(mconf, myOpts);
    return {
        flagOptions,
        greenlock,
        mconf
    };
};

Flags.mangleFlags = function(flags, mconf, sconf, extras) {
    if (extras) {
        if (extras.forceSave) {
            flags.forceSave = true;
        }
    }
    //console.log('debug a:', flags);

    if ('altnames' in flags) {
        flags.altnames = (flags.altnames || '').split(/[,\s]+/).filter(Boolean);
    }
    if ('servernames' in flags) {
        flags.servernames = (flags.servernames || '')
            .split(/[,\s]+/)
            .filter(Boolean);
    }

    var store;
    if (flags.store) {
        store = flags.storeOpts;
        store.module = flags.store;
        flags.store = store;
    } else {
        delete flags.store;
    }
    delete flags.storeOpts;

    // If this is additive, make an object to hold all values
    var isAdditive = [
        ['http-01', 'Http01'],
        ['dns-01', 'Dns01'],
        ['tls-alpn-01', 'TlsAlpn01']
    ].some(function(types) {
        var typCamel = types[1];
        var modname = 'challenge' + typCamel;
        if (flags[modname]) {
            if (!flags.challenges) {
                flags.challenges = {};
            }
            return true;
        }
    });
    if (isAdditive && sconf) {
        // copy over the old
        var schallenges = sconf.challenges || {};
        Object.keys(schallenges).forEach(function(k) {
            if (!flags.challenges[k]) {
                flags.challenges[k] = schallenges[k];
            }
        });
    }

    var typ;
    var challenge;
    if (flags.challenge) {
        // this varient of the flag is exclusive
        flags.challenges = {};
        isAdditive = false;

        if (/http-01/.test(flags.challenge)) {
            typ = 'http-01';
        } else if (/dns-01/.test(flags.challenge)) {
            typ = 'dns-01';
        } else if (/tls-alpn-01/.test(flags.challenge)) {
            typ = 'tls-alpn-01';
        }

        var modname = 'challenge';
        var optsname = 'challengeOpts';
        challenge = flags[optsname];
        // JSON may already have module name
        if (challenge.module) {
            if (flags[modname] && challenge.module !== flags[modname]) {
                console.error(
                    'module names do not match:',
                    JSON.stringify(challenge.module),
                    JSON.stringify(flags[modname])
                );
                process.exit(1);
            }
        } else {
            challenge.module = flags[modname];
        }
        flags.challenges[typ] = challenge;

        var chall = mconf.challenges[typ];
        if (chall && challenge.module === chall.module) {
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
    delete flags.challenge;
    delete flags.challengeOpts;

    // Add each of the values, including the existing
    [
        ['http-01', 'Http01'],
        ['dns-01', 'Dns01'],
        ['tls-alpn-01', 'TlsAlpn01']
    ].forEach(function(types) {
        var typ = types[0];
        var typCamel = types[1];
        var modname = 'challenge' + typCamel;
        var optsname = 'challenge' + typCamel + 'Opts';
        var chall = mconf.challenges[typ];
        var challenge = flags[optsname];

        // this variant of the flag is additive
        if (isAdditive && chall && flags.forceSave) {
            if (flags.challenges && !flags.challenges[typ]) {
                flags.challenges[typ] = chall;
            }
        }

        if (!flags[modname]) {
            delete flags[modname];
            delete flags[optsname];
            return;
        }

        // JSON may already have module name
        if (challenge.module) {
            if (flags[modname] && challenge.module !== flags[modname]) {
                console.error(
                    'module names do not match:',
                    JSON.stringify(challenge.module),
                    JSON.stringify(flags[modname])
                );
                process.exit(1);
            }
        } else {
            challenge.module = flags[modname];
        }
        if (flags[modname]) {
            if (!flags.challenges) {
                flags.challenges = {};
            }
            flags.challenges[typ] = challenge;
        }

        // Check to see if this is already what's set in the defaults
        if (chall && challenge.module === chall.module) {
            var keys = Object.keys(challenge);
            // Check if all of the options are also the same
            var same =
                !keys.length ||
                keys.every(function(k) {
                    return chall[k] === challenge[k];
                });
            if (same && !flags.forceSave) {
                // If it's already the global, don't make it the per-site
                delete flags[modname];
                delete flags[optsname];
            }
        }

        delete flags[modname];
        delete flags[optsname];
    });

    [
        ['accountKeyType', [/256/, /384/, /EC/], 'EC-P256'],
        ['serverKeyType', [/RSA/], 'RSA-2048']
    ].forEach(function(k) {
        var key = k[0];
        var vals = k[1];
        var val = flags[key];
        if (val) {
            if (
                !vals.some(function(v) {
                    return v.test(val);
                })
            ) {
                flags[key] = k[2];
                console.warn(
                    key,
                    "does not allow the value '",
                    val,
                    "' using the default '",
                    k[2],
                    "' instead."
                );
            }
        }
    });

    Object.keys(flags).forEach(function(k) {
        if (flags[k] === mconf[k] && !flags.forceSave) {
            delete flags[k];
        }
    });

    //console.log('debug z:', flags);
    delete flags.forceSave;
};
