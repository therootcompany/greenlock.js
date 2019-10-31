'use strict';

var mkdirp = require('@root/mkdirp');
var cli = require('./cli.js');

cli.parse({
    'directory-url': [
        false,
        ' ACME Directory Resource URL',
        'string',
        'https://acme-v02.api.letsencrypt.org/directory',
        'server,acme-url'
    ],
    email: [
        false,
        ' Email used for registration and recovery contact. (default: null)',
        'email'
    ],
    'agree-tos': [
        false,
        " Agree to the Greenlock and Let's Encrypt Subscriber Agreements",
        'boolean',
        false
    ],
    'community-member': [
        false,
        ' Submit stats to and get updates from Greenlock',
        'boolean',
        false
    ],
    domains: [
        false,
        ' Domain names to apply. For multiple domains you can enter a comma separated list of domains as a parameter. (default: [])',
        'string'
    ],
    'renew-offset': [
        false,
        ' Positive (time after issue) or negative (time before expiry) offset, such as 30d or -45d',
        'string',
        '45d'
    ],
    'renew-within': [
        false,
        ' (ignored) use renew-offset instead',
        'ignore',
        undefined
    ],
    'cert-path': [
        false,
        ' Path to where new cert.pem is saved',
        'string',
        ':configDir/live/:hostname/cert.pem'
    ],
    'fullchain-path': [
        false,
        ' Path to where new fullchain.pem (cert + chain) is saved',
        'string',
        ':configDir/live/:hostname/fullchain.pem'
    ],
    'bundle-path': [
        false,
        ' Path to where new bundle.pem (fullchain + privkey) is saved',
        'string',
        ':configDir/live/:hostname/bundle.pem'
    ],
    'chain-path': [
        false,
        ' Path to where new chain.pem is saved',
        'string',
        ':configDir/live/:hostname/chain.pem'
    ],
    'privkey-path': [
        false,
        ' Path to where privkey.pem is saved',
        'string',
        ':configDir/live/:hostname/privkey.pem'
    ],
    'config-dir': [
        false,
        ' Configuration directory.',
        'string',
        '~/letsencrypt/etc/'
    ],
    store: [
        false,
        ' The name of the storage module to use',
        'string',
        'greenlock-store-fs'
    ],
    'store-xxxx': [
        false,
        ' An option for the chosen storage module, such as --store-apikey or --store-bucket',
        'bag'
    ],
    'store-json': [
        false,
        ' A JSON string containing all option for the chosen store module (instead of --store-xxxx)',
        'json',
        '{}'
    ],
    challenge: [
        false,
        ' The name of the HTTP-01, DNS-01, or TLS-ALPN-01 challenge module to use',
        'string',
        '@greenlock/acme-http-01-fs'
    ],
    'challenge-xxxx': [
        false,
        ' An option for the chosen challenge module, such as --challenge-apikey or --challenge-bucket',
        'bag'
    ],
    'challenge-json': [
        false,
        ' A JSON string containing all option for the chosen challenge module (instead of --challenge-xxxx)',
        'json',
        '{}'
    ],
    'skip-dry-run': [
        false,
        ' Use with caution (and test with the staging url first). Creates an Order on the ACME server without a self-test.',
        'boolean'
    ],
    'skip-challenge-tests': [
        false,
        ' Use with caution (and with the staging url first). Presents challenges to the ACME server without first testing locally.',
        'boolean'
    ],
    'http-01-port': [
        false,
        ' Required to be 80 for live servers. Do not use. For special test environments only.',
        'int'
    ],
    'dns-01': [false, ' Use DNS-01 challange type', 'boolean', false],
    standalone: [
        false,
        ' Obtain certs using a "standalone" webserver.',
        'boolean',
        false
    ],
    manual: [
        false,
        ' Print the token and key to the screen and wait for you to hit enter, giving you time to copy it somewhere before continuing (uses acme-http-01-cli or acme-dns-01-cli)',
        'boolean',
        false
    ],
    debug: [false, ' show traces and logs', 'boolean', false],
    root: [
        false,
        ' public_html / webroot path (may use the :hostname template such as /srv/www/:hostname)',
        'string',
        undefined,
        'webroot-path'
    ],

    //
    // backwards compat
    //
    duplicate: [
        false,
        ' Allow getting a certificate that duplicates an existing one/is an early renewal',
        'boolean',
        false
    ],
    'rsa-key-size': [
        false,
        ' (ignored) use server-key-type or account-key-type instead',
        'ignore',
        2048
    ],
    'server-key-path': [
        false,
        ' Path to privkey.pem to use for certificate (default: generate new)',
        'string',
        undefined,
        'domain-key-path'
    ],
    'server-key-type': [
        false,
        " One of 'RSA' (2048), 'RSA-3084', 'RSA-4096', 'ECDSA' (P-256), or 'P-384'. For best compatibility, security, and efficiency use the default (More bits != More security)",
        'string',
        'RSA'
    ],
    'account-key-path': [
        false,
        ' Path to privkey.pem to use for account (default: generate new)',
        'string'
    ],
    'account-key-type': [
        false,
        " One of 'ECDSA' (P-256), 'P-384', 'RSA', 'RSA-3084', or 'RSA-4096'. Stick with 'ECDSA' (P-256) unless you need 'RSA' (2048) for legacy compatibility. (More bits != More security)",
        'string',
        'P-256'
    ],
    webroot: [false, ' (ignored) for certbot compatibility', 'ignore', false],
    //, 'standalone-supported-challenges': [ false, " Supported challenges, order preferences are randomly chosen. (default: http-01,tls-alpn-01)", 'string', 'http-01']
    'work-dir': [
        false,
        ' for certbot compatibility (ignored)',
        'string',
        '~/letsencrypt/var/lib/'
    ],
    'logs-dir': [
        false,
        ' for certbot compatibility (ignored)',
        'string',
        '~/letsencrypt/var/log/'
    ],
    'acme-version': [
        false,
        ' (ignored) ACME is now RFC 8555 and prior drafts are no longer supported',
        'ignore',
        'rfc8555'
    ]
});

// ignore certonly and extraneous arguments
cli.main(function(_, options) {
    console.info('');

    [
        'configDir',
        'privkeyPath',
        'certPath',
        'chainPath',
        'fullchainPath',
        'bundlePath'
    ].forEach(function(k) {
        if (options[k]) {
            options.storeOpts[k] = options[k];
        }
        delete options[k];
    });

    if (options.workDir) {
        options.challengeOpts.workDir = options.workDir;
        delete options.workDir;
    }

    if (options.debug) {
        console.debug(options);
    }

    var args = {};
    var homedir = require('os').homedir();

    Object.keys(options).forEach(function(key) {
        var val = options[key];

        if ('string' === typeof val) {
            val = val.replace(/^~/, homedir);
        }

        key = key.replace(/\-([a-z0-9A-Z])/g, function(c) {
            return c[1].toUpperCase();
        });
        args[key] = val;
    });

    Object.keys(args).forEach(function(key) {
        var val = args[key];

        if ('string' === typeof val) {
            val = val.replace(/(\:configDir)|(\:config)/, args.configDir);
        }

        args[key] = val;
    });

    if (args.domains) {
        args.domains = args.domains.split(',');
    }

    if (
        !(Array.isArray(args.domains) && args.domains.length) ||
        !args.email ||
        !args.agreeTos ||
        (!args.server && !args.directoryUrl)
    ) {
        console.error('\nUsage:\n\ngreenlock certonly --standalone \\');
        console.error(
            '\t--agree-tos --email user@example.com --domains example.com \\'
        );
        console.error('\t--config-dir ~/acme/etc \\');
        console.error('\nSee greenlock --help for more details\n');
        return;
    }

    if (args.http01Port) {
        // [@agnat]: Coerce to string. cli returns a number although we request a string.
        args.http01Port = '' + args.http01Port;
        args.http01Port = args.http01Port.split(',').map(function(port) {
            return parseInt(port, 10);
        });
    }

    function run() {
        var challenges = {};
        if (/http.?01/i.test(args.challenge)) {
            challenges['http-01'] = args.challengeOpts;
        }
        if (/dns.?01/i.test(args.challenge)) {
            challenges['dns-01'] = args.challengeOpts;
        }
        if (/alpn.?01/i.test(args.challenge)) {
            challenges['tls-alpn-01'] = args.challengeOpts;
        }
        if (!Object.keys(challenges).length) {
            throw new Error(
                "Could not determine the challenge type for '" +
                    args.challengeOpts.module +
                    "'. Expected a name like @you/acme-xxxx-01-foo. Please name the module with http-01, dns-01, or tls-alpn-01."
            );
        }
        args.challengeOpts.module = args.challenge;
        args.storeOpts.module = args.store;

        console.log('\ngot to the run step');
        require(args.challenge);
        require(args.store);

        var greenlock = require('../').create({
            maintainerEmail: args.maintainerEmail || 'coolaj86@gmail.com',
            manager: './manager.js',
            configFile: '~/.config/greenlock/certs.json',
            challenges: challenges,
            store: args.storeOpts,
            renewOffset: args.renewOffset || '30d',
            renewStagger: '1d'
        });

        // for long-running processes
        if (args.renewEvery) {
            setInterval(function() {
                greenlock.renew({
                    period: args.renewEvery
                });
            }, args.renewEvery);
        }

        // TODO should greenlock.add simply always include greenlock.renew?
        // the concern is conflating error events
        return greenlock
            .add({
                subject: args.subject,
                altnames: args.altnames,
                subscriberEmail: args.subscriberEmail || args.email
            })
            .then(function(changes) {
                console.info(changes);
                // renew should always
                return greenlock
                    .renew({
                        subject: args.subject,
                        force: false
                    })
                    .then(function() {});
            });
    }

    if ('greenlock-store-fs' !== args.store) {
        run();
        return;
    }

    // TODO remove mkdirp and let greenlock-store-fs do this?
    mkdirp(args.storeOpts.configDir, function(err) {
        if (!err) {
            run();
        }

        console.error(
            "Could not create --config-dir '" + args.configDir + "':",
            err.code
        );
        console.error("Try setting --config-dir '/tmp'");
        return;
    });
}, process.argv.slice(3));
