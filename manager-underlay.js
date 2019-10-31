'use strict';

var U = require('./utils.js');
var E = require('./errors.js');

var warned = {};

module.exports.wrap = function(greenlock, manager) {
    greenlock.manager = {};
    greenlock.sites = {};
    //greenlock.accounts = {};
    //greenlock.certs = {};

    var allowed = [
        'accountKeyType', //: ["P-256", "RSA-2048"],
        'serverKeyType', //: ["RSA-2048", "P-256"],
        'store', // : { module, specific opts },
        'challenges', // : { "http-01", "dns-01", "tls-alpn-01" },
        'subscriberEmail',
        'agreeToTerms',
        'agreeTos',
        'customerEmail',
        'renewOffset',
        'renewStagger',
        'module', // not allowed, just ignored
        'manager'
    ];

    // get / set default site settings such as
    // subscriberEmail, store, challenges, renewOffset, renewStagger
    greenlock.manager.defaults = function(conf) {
        return greenlock._init().then(function() {
            if (!conf) {
                return manager.defaults();
            }

            if (conf.sites) {
                throw new Error('cannot set sites as global config');
            }
            if (conf.routes) {
                throw new Error('cannot set routes as global config');
            }

            // disallow keys we know to be bad
            [
                'subject',
                'deletedAt',
                'altnames',
                'lastAttemptAt',
                'expiresAt',
                'issuedAt',
                'renewAt',
                'sites',
                'routes'
            ].some(function(k) {
                if (k in conf) {
                    throw new Error(
                        '`' + k + '` not allowed as a default setting'
                    );
                }
            });
            Object.keys(conf).forEach(function(k) {
                if (!allowed.includes(k) && !warned[k]) {
                    warned[k] = true;
                    console.warn(
                        k +
                            " isn't a known key. Please open an issue and let us know the use case."
                    );
                }
            });

            Object.keys(conf).forEach(function(k) {
                if (-1 !== ['module', 'manager'].indexOf(k)) {
                    return;
                }

                if ('undefined' === typeof k) {
                    throw new Error(
                        "'" +
                            k +
                            "' should be set to a value, or `null`, but not left `undefined`"
                    );
                }
            });

            return manager.defaults(conf);
        });
    };

    greenlock.add = greenlock.manager.add = function(args) {
        if (!args || !Array.isArray(args.altnames) || !args.altnames.length) {
            throw new Error(
                'you must specify `altnames` when adding a new site'
            );
        }
        if (args.renewAt) {
            throw new Error(
                'you cannot specify `renewAt` when adding a new site'
            );
        }

        return greenlock.manager.set(args);
    };

    // TODO agreeToTerms should be handled somewhere... maybe?

    // Add and update remains because I said I had locked the API
    greenlock.manager.set = greenlock.manager.update = function(args) {
        return greenlock._init().then(function() {
            // The goal is to make this decently easy to manage by hand without mistakes
            // but also reasonably easy to error check and correct
            // and to make deterministic auto-corrections

            args.subject = checkSubject(args);

            //var subscriberEmail = args.subscriberEmail;

            // TODO shortcut the other array checks when not necessary
            if (Array.isArray(args.altnames)) {
                args.altnames = checkAltnames(args.subject, args);
            }

            // at this point we know that subject is the first of altnames
            return Promise.all(
                (args.altnames || []).map(function(d) {
                    d = d.replace('*.', '');
                    return U._validDomain(d);
                })
            ).then(function() {
                if (!U._uniqueNames(args.altnames || [])) {
                    throw E.NOT_UNIQUE(
                        'add',
                        "'" + args.altnames.join("' '") + "'"
                    );
                }

                // durations
                if (args.renewOffset) {
                    args.renewOffset = U._parseDuration(args.renewOffset);
                }
                if (args.renewStagger) {
                    args.renewStagger = U._parseDuration(args.renewStagger);
                }

                return manager.set(args).then(function(result) {
                    greenlock.renew({}).catch(function(err) {
                        if (!err.context) {
                            err.contxt = 'renew';
                        }
                        greenlock._notify('error', err);
                    });
                    return result;
                });
            });
        });
    };

    greenlock.manager.remove = function(args) {
        args.subject = checkSubject(args);
        // TODO check no altnames
        return manager.remove(args);
    };

    /*
  {
    subject: site.subject,
    altnames: site.altnames,
    //issuedAt: site.issuedAt,
    //expiresAt: site.expiresAt,
    renewOffset: site.renewOffset,
    renewStagger: site.renewStagger,
    renewAt: site.renewAt,
    subscriberEmail: site.subscriberEmail,
    customerEmail: site.customerEmail,
    challenges: site.challenges,
    store: site.store
  };
  */

    greenlock._find = function(args) {
        var altnames = args.altnames || [];

        // servername, wildname, and altnames are all the same
        ['wildname', 'servername'].forEach(function(k) {
            var altname = args[k] || '';
            if (altname && !altnames.includes(altname)) {
                altnames.push(altname);
            }
        });

        if (altnames.length) {
            args.altnames = altnames;
            args.altnames = args.altnames.map(U._encodeName);
            args.altnames = checkAltnames(false, args);
        }

        return manager.find(args);
    };
};

function checkSubject(args) {
    if (!args || !args.subject) {
        throw new Error('you must specify `subject` when configuring a site');
    }
    /*
		if (!args.subject) {
			throw E.NO_SUBJECT('add');
		}
    */

    var subject = (args.subject || '').toLowerCase();
    if (subject !== args.subject) {
        console.warn('`subject` must be lowercase', args.subject);
    }

    return U._encodeName(subject);
}

function checkAltnames(subject, args) {
    // the things we have to check and get right
    var altnames = (args.altnames || []).map(function(name) {
        return String(name || '').toLowerCase();
    });

    if (subject && subject !== altnames[0]) {
        throw new Error(
            '`subject` must be the first domain in `altnames`',
            args.subject,
            altnames.join(' ')
        );
    }

    /*
		if (args.subject !== args.altnames[0]) {
			throw E.BAD_ORDER(
				'add',
				'(' + args.subject + ") '" + args.altnames.join("' '") + "'"
			);
		}
  */

    // punycode BEFORE validation
    // (set, find, remove)
    args.altnames = args.altnames.map(U._encodeName);
    if (
        !args.altnames.every(function(d) {
            return U._validName(d);
        })
    ) {
        throw E.INVALID_HOSTNAME('add', "'" + args.altnames.join("' '") + "'");
    }

    if (altnames.join() !== args.altnames.join()) {
        console.warn('all domains in `altnames` must be lowercase', altnames);
    }

    return altnames;
}
