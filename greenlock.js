'use strict';

var pkg = require('./package.json');

var ACME = require('@root/acme');
var Greenlock = module.exports;
var request = require('@root/request');

var G = Greenlock;
var U = require('./utils.js');
var E = require('./errors.js');
var P = require('./plugins.js');
var A = require('./accounts.js');
var C = require('./certificates.js');
var UserEvents = require('./user-events.js');

var caches = {};

// { maintainerEmail, directoryUrl, subscriberEmail, store, challenges  }
G.create = function(gconf) {
    var greenlock = {};
    var gdefaults = {};
    if (!gconf) {
        gconf = {};
    }
    var manager;

    greenlock._create = function() {
        if (!gconf.maintainerEmail) {
            throw E.NO_MAINTAINER('create');
        }

        // TODO send welcome message with benefit info
        U._validMx(gconf.maintainerEmail).catch(function() {
            console.error(
                'invalid maintainer contact info:',
                gconf.maintainerEmail
            );

            // maybe move this to init and don't exit the process, just in case
            process.exit(1);
        });

        if ('function' === typeof gconf.notify) {
            gdefaults.notify = gconf.notify;
        } else {
            gdefaults.notify = _notify;
        }

        if (gconf.directoryUrl) {
            gdefaults = gconf.directoryUrl;
            if (gconf.staging) {
                throw new Error(
                    'supply `directoryUrl` or `staging`, but not both'
                );
            }
        } else if (gconf.staging) {
            gdefaults.directoryUrl =
                'https://acme-staging-v02.api.letsencrypt.org/directory';
        } else {
            gdefaults.directoryUrl =
                'https://acme-v02.api.letsencrypt.org/directory';
        }
        console.info('ACME Directory URL:', gdefaults.directoryUrl);

        manager = normalizeManager(gconf);

        // Wraps each of the following with appropriate error checking
        // greenlock.manager.defaults
        // greenlock.manager.add
        // greenlock.manager.update
        // greenlock.manager.remove
        // greenlock.manager.find
        require('./manager-underlay.js').wrap(greenlock, manager, gconf);
        // The goal here is to reduce boilerplate, such as error checking
        // and duration parsing, that a manager must implement
        greenlock.sites.add = greenlock.add = greenlock.manager.add;

        // Exports challenges.get for Greenlock Express HTTP-01,
        // and whatever odd use case pops up, I suppose
        // greenlock.challenges.get
        require('./challenges-underlay.js').wrap(greenlock, manager, gconf);

        greenlock._defaults = gdefaults;
        greenlock._defaults.debug = gconf.debug;

        // renew every 90-ish minutes (random for staggering)
        // the weak setTimeout (unref) means that when run as a CLI process this
        // will still finish as expected, and not wait on the timeout
        (function renew() {
            setTimeout(function() {
                greenlock.renew({});
                renew();
            }, Math.PI * 30 * 60 * 1000).unref();
        })();
    };

    // The purpose of init is to make MCONF the source of truth
    greenlock._init = function() {
        var p;
        greenlock._init = function() {
            return p;
        };

        if (manager.init) {
            // TODO punycode?
            p = manager.init({
                request: request
                //punycode: require('punycode')
            });
        } else {
            p = Promise.resolve();
        }
        p = p
            .then(function() {
                return manager.defaults().then(function(MCONF) {
                    mergeDefaults(MCONF, gconf);
                    if (true === MCONF.agreeToTerms) {
                        gdefaults.agreeToTerms = function(tos) {
                            return Promise.resolve(tos);
                        };
                    }
                    return manager.defaults(MCONF);
                });
            })
            .catch(function(err) {
                console.error('Fatal error during greenlock init:');
                console.error(err);
                process.exit(1);
            });
        return p;
    };

    greenlock.notify = greenlock._notify = function(ev, params) {
        var mng = greenlock.manager;

        if ('_' === String(ev)[0]) {
            if ('_cert_issue' === ev) {
                try {
                    mng.update({
                        subject: params.subject,
                        renewAt: params.renewAt
                    }).catch(function(e) {
                        e.context = '_cert_issue';
                        greenlock._notify('error', e);
                    });
                } catch (e) {
                    e.context = '_cert_issue';
                    greenlock._notify('error', e);
                }
            }
            // trap internal events internally
            return;
        }

        try {
            var p = greenlock._defaults.notify(ev, params);
            if (p && p.catch) {
                p.catch(function(e) {
                    console.error("Promise Rejection on event '" + ev + "':");
                    console.error(e);
                });
            }
        } catch (e) {
            console.error("Thrown Exception on event '" + ev + "':");
            console.error(e);
            console.error(params);
        }

        if (-1 !== ['cert_issue', 'cert_renewal'].indexOf(ev)) {
            // We will notify all greenlock users of mandatory and security updates
            // We'll keep track of versions and os so we can make sure things work well
            // { name, version, email, domains, action, communityMember, telemetry }
            // TODO look at the other one
            UserEvents.notify({
                /*
        // maintainer should be only on pre-publish, or maybe install, I think
        maintainerEmail: greenlock._defaults._maintainerEmail,
        name: greenlock._defaults._packageAgent,
        version: greenlock._defaults._maintainerPackageVersion,
        //action: params.pems._type,
        domains: params.altnames,
        subscriberEmail: greenlock._defaults._subscriberEmail,
        // TODO enable for Greenlock Pro
        //customerEmail: args.customerEmail
        telemetry: greenlock._defaults.telemetry
        */
            });
        }
    };

    // certs.get
    greenlock.get = function(args) {
        return greenlock
            ._single(args)
            .then(function() {
                args._includePems = true;
                return greenlock.renew(args);
            })
            .then(function(results) {
                if (!results || !results.length) {
                    // TODO throw an error here?
                    return null;
                }

                // just get the first one
                var result = results[0];

                // (there should be only one, ideally)
                if (results.length > 1) {
                    var err = new Error(
                        "a search for '" +
                            args.servername +
                            "' returned multiple certificates"
                    );
                    err.context = 'duplicate_certs';
                    err.servername = args.servername;
                    err.subjects = results.map(function(r) {
                        return (r.site || {}).subject || 'N/A';
                    });

                    greenlock._notify('warning', err);
                }

                if (result.error) {
                    return Promise.reject(result.error);
                }

                // site for plugin options, such as http-01 challenge
                // pems for the obvious reasons
                return result;
            });
    };

    greenlock._single = function(args) {
        if ('string' !== typeof args.servername) {
            return Promise.reject(new Error('no `servername` given'));
        }
        // www.example.com => *.example.com
        args.wildname =
            '*.' +
            args.servername
                .split('.')
                .slice(1)
                .join('.');
        if (
            args.servernames ||
            args.subject ||
            args.renewBefore ||
            args.issueBefore ||
            args.expiresBefore
        ) {
            return Promise.reject(
                new Error(
                    'bad arguments, did you mean to call greenlock.renew()?'
                )
            );
        }
        // duplicate, force, and others still allowed
        return Promise.resolve(args);
    };

    greenlock._config = function(args) {
        return greenlock
            ._single(args)
            .then(function() {
                return greenlock._find(args);
            })
            .then(function(sites) {
                if (!sites || !sites.length) {
                    return null;
                }
                var site = sites[0];
                site = JSON.parse(JSON.stringify(site));
                if (site.store && site.challenges) {
                    return site;
                }
                return manager.defaults().then(function(mconf) {
                    if (!site.store) {
                        site.store = mconf.store;
                    }
                    if (!site.challenges) {
                        site.challenges = mconf.challenges;
                    }
                    return site;
                });
            });
    };

    // needs to get info about the renewal, such as which store and challenge(s) to use
    greenlock.renew = function(args) {
        return greenlock._init().then(function() {
            return manager.defaults().then(function(mconf) {
                return greenlock._renew(mconf, args);
            });
        });
    };
    greenlock._renew = function(mconf, args) {
        if (!args) {
            args = {};
        }

        var renewedOrFailed = [];
        //console.log('greenlock._renew find', args);
        return greenlock._find(args).then(function(sites) {
            // Note: the manager must guaranteed that these are mutable copies
            //console.log('greenlock._renew found', sites);;

            if (!Array.isArray(sites)) {
                throw new Error(
                    'Developer Error: not an array of sites returned from find: ' +
                        JSON.stringify(sites)
                );
            }
            function next() {
                var site = sites.shift();
                if (!site) {
                    return Promise.resolve(null);
                }

                var order = { site: site };
                renewedOrFailed.push(order);
                // TODO merge args + result?
                return greenlock
                    ._order(mconf, site)
                    .then(function(pems) {
                        if (args._includePems) {
                            order.pems = pems;
                        }
                    })
                    .catch(function(err) {
                        order.error = err;

                        // For greenlock express serialization
                        err.toJSON = errorToJSON;
                        err.context = err.context || 'cert_order';
                        err.subject = site.subject;
                        if (args.servername) {
                            err.servername = args.servername;
                        }
                        // for debugging, but not to be relied on
                        err._site = site;
                        // TODO err.context = err.context || 'renew_certificate'
                        greenlock._notify('error', err);
                    })
                    .then(function() {
                        return next();
                    });
            }

            return next().then(function() {
                return renewedOrFailed;
            });
        });
    };

    greenlock._acme = function(args) {
        var packageAgent = gconf.packageAgent || '';
        // because Greenlock_Express/v3.x Greenlock/v3 is redundant
        if (!/greenlock/i.test(packageAgent)) {
            packageAgent = (packageAgent + ' Greenlock/' + pkg.version).trim();
        }
        var acme = ACME.create({
            maintainerEmail: gconf.maintainerEmail,
            packageAgent: packageAgent,
            notify: greenlock._notify,
            debug: greenlock._defaults.debug || args.debug
        });
        var dirUrl = args.directoryUrl || greenlock._defaults.directoryUrl;

        var dir = caches[dirUrl];

        // don't cache more than an hour
        if (dir && Date.now() - dir.ts < 1 * 60 * 60 * 1000) {
            return dir.promise;
        }

        return acme
            .init(dirUrl)
            .then(function(/*meta*/) {
                caches[dirUrl] = {
                    promise: Promise.resolve(acme),
                    ts: Date.now()
                };
                return acme;
            })
            .catch(function(err) {
                // TODO
                // let's encrypt is possibly down for maintenaince...
                // this is a special kind of failure mode
                throw err;
            });
    };

    greenlock.order = function(args) {
        return greenlock._init().then(function() {
            return manager.defaults().then(function(mconf) {
                return greenlock._order(mconf, args);
            });
        });
    };
    greenlock._order = function(mconf, args) {
        // packageAgent, maintainerEmail
        return greenlock._acme(args).then(function(acme) {
            var storeConf = args.store || mconf.store;
            return P._loadStore(storeConf).then(function(store) {
                return A._getOrCreate(
                    greenlock,
                    mconf,
                    store.accounts,
                    acme,
                    args
                ).then(function(account) {
                    var challengeConfs = args.challenges || mconf.challenges;
                    return Promise.all(
                        Object.keys(challengeConfs).map(function(typ01) {
                            return P._loadChallenge(challengeConfs, typ01);
                        })
                    ).then(function(arr) {
                        var challenges = {};
                        arr.forEach(function(el) {
                            challenges[el._type] = el;
                        });
                        return C._getOrOrder(
                            greenlock,
                            mconf,
                            store.certificates,
                            acme,
                            challenges,
                            account,
                            args
                        ).then(function(pems) {
                            if (!pems) {
                                throw new Error('no order result');
                            }
                            if (!pems.privkey) {
                                throw new Error(
                                    'missing private key, which is kinda important'
                                );
                            }
                            return pems;
                        });
                    });
                });
            });
        });
    };

    greenlock._create();

    return greenlock;
};

G._loadChallenge = P._loadChallenge;

function errorToJSON(e) {
    var error = {};
    Object.getOwnPropertyNames(e).forEach(function(k) {
        error[k] = e[k];
    });
    return error;
}

function normalizeManager(gconf) {
    var m;
    // 1. Get the manager
    // 2. Figure out if we need to wrap it

    if (!gconf.manager) {
        gconf.manager = 'greenlock-manager-fs';
        if (gconf.find) {
            // { manager: 'greenlock-manager-fs', find: function () { } }
            warpFind(gconf);
        }
    }

    if ('string' === typeof gconf.manager) {
        try {
            // wrap this to be safe for greenlock-manager-fs
            m = require(gconf.manager).create(gconf);
        } catch (e) {
            console.error(e.code);
            console.error(e.message);
        }
    } else {
        m = gconf.manager;
    }

    if (!m) {
        console.error();
        console.error(
            'Failed to load manager plugin ',
            JSON.stringify(gconf.manager)
        );
        console.error();
        process.exit(1);
    }

    if (
        ['set', 'remove', 'find', 'defaults'].every(function(k) {
            return 'function' === typeof m[k];
        })
    ) {
        return m;
    }

    // { manager: { find: function () {  } } }
    if (m.find) {
        warpFind(m);
    }
    // m.configFile could also be set
    m = require('greenlock-manager-fs').create(m);

    if ('function' !== typeof m.find) {
        console.error();
        console.error(
            JSON.stringify(gconf.manager),
            'must implement `find()` and should implement `set()`, `remove()`, `defaults()`, and `init()`'
        );
        console.error();
        process.exit(1);
    }

    return m;
}

function warpFind(gconf) {
    gconf.__gl_find = gconf.find;
    gconf.find = function(args) {
        // the incoming args will be normalized by greenlock
        return gconf.__gl_find(args).then(function(sites) {
            // we also need to error check the incoming sites,
            // as if they were being passed through `add()` or `set()`
            // (effectively they are) because the manager assumes that
            // they're not bad
            sites.forEach(function(s) {
                if (!s || 'string' !== typeof s.subject) {
                    throw new Error('missing subject');
                }
                if (
                    !Array.isArray(s.altnames) ||
                    !s.altnames.length ||
                    !s.altnames[0] ||
                    s.altnames[0] !== s.subject
                ) {
                    throw new Error('missing or malformed altnames');
                }
                ['renewAt', 'issuedAt', 'expiresAt'].forEach(function(k) {
                    if (s[k]) {
                        throw new Error(
                            '`' +
                                k +
                                '` should be updated by `set()`, not by `find()`'
                        );
                    }
                });
            });
            return sites;
        });
    };
}

function mergeDefaults(MCONF, gconf) {
    if (
        gconf.agreeToTerms === true ||
        MCONF.agreeToTerms === true ||
        // TODO deprecate
        gconf.agreeTos === true ||
        MCONF.agreeTos === true
    ) {
        MCONF.agreeToTerms = true;
    }

    if (!MCONF.subscriberEmail && gconf.subscriberEmail) {
        MCONF.subscriberEmail = gconf.subscriberEmail;
    }

    var homedir;
    // Load the default store module
    if (!MCONF.store) {
        if (gconf.store) {
            MCONF.store = gconf.store;
        } else {
            homedir = require('os').homedir();
            MCONF.store = {
                module: 'greenlock-store-fs',
                basePath: homedir + '/.config/greenlock/'
            };
        }
    }
    // just to test that it loads
    P._loadSync(MCONF.store.module);

    // Load the default challenge modules
    var challenges = MCONF.challenges || gconf.challenges;
    if (!challenges) {
        challenges = {};
    }
    if (!challenges['http-01'] && !challenges['dns-01']) {
        challenges['http-01'] = { module: 'acme-http-01-standalone' };
    }
    if (challenges['http-01']) {
        if ('string' !== typeof challenges['http-01'].module) {
            throw new Error(
                'bad challenge http-01 module config:' +
                    JSON.stringify(challenges['http-01'])
            );
        }
        P._loadSync(challenges['http-01'].module);
    }
    if (challenges['dns-01']) {
        if ('string' !== typeof challenges['dns-01'].module) {
            throw new Error(
                'bad challenge dns-01 module config' +
                    JSON.stringify(challenges['dns-01'])
            );
        }
        P._loadSync(challenges['dns-01'].module);
    }
    MCONF.challenges = challenges;

    if (!MCONF.renewOffset) {
        MCONF.renewOffset = gconf.renewOffset || '-45d';
    }
    if (!MCONF.renewStagger) {
        MCONF.renewStagger = gconf.renewStagger || '3d';
    }

    if (!MCONF.accountKeyType) {
        MCONF.accountKeyType = gconf.accountKeyType || 'EC-P256';
    }
    if (!MCONF.serverKeyType) {
        MCONF.serverKeyType = gconf.serverKeyType || 'RSA-2048';
    }
}

function _notify(ev, args) {
    if (!args) {
        args = ev;
        ev = args.event;
        delete args.event;
    }

    // TODO define message types
    if (!_notify._notice) {
        console.info(
            'set greenlockOptions.notify to override the default logger'
        );
        _notify._notice = true;
    }
    var prefix = 'Warning';
    switch (ev) {
        case 'error':
            prefix = 'Error';
        /* falls through */
        case 'warning':
            console.error(
                prefix + '%s:',
                (' ' + (args.context || '')).trimRight()
            );
            console.error(args.message);
            if (args.description) {
                console.error(args.description);
            }
            if (args.code) {
                console.error('code:', args.code);
            }
            if (args.stack) {
                console.error(args.stack);
            }
            break;
        default:
            if (/status/.test(ev)) {
                console.info(
                    ev,
                    args.altname || args.subject || '',
                    args.status || ''
                );
                if (!args.status) {
                    console.info(args);
                }
                break;
            }
            console.info(
                ev,
                '(more info available: ' + Object.keys(args).join(' ') + ')'
            );
    }
}
