'use strict';

var pkg = require('./package.json');

var ACME = require('@root/acme');
var Greenlock = module.exports;
var request = require('@root/request');
var process = require('process');

var G = Greenlock;
var U = require('./utils.js');
var E = require('./errors.js');
var P = require('./plugins.js');
var A = require('./accounts.js');
var C = require('./certificates.js');

var DIR = require('./lib/directory-url.js');
var ChWrapper = require('./lib/challenges-wrapper.js');
var MngWrapper = require('./lib/manager-wrapper.js');

var UserEvents = require('./user-events.js');
var Init = require('./lib/init.js');

var caches = {};

// { maintainerEmail, directoryUrl, subscriberEmail, store, challenges  }
G.create = function(gconf) {
    var greenlock = {};
    var gdefaults = {};
    if (!gconf) {
        gconf = {};
    }

    greenlock._create = function() {
        if (!gconf._bin_mode) {
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
        }

        if ('function' === typeof gconf.notify) {
            gdefaults.notify = gconf.notify;
        } else {
            gdefaults.notify = _notify;
        }

        gconf = Init._init(gconf);

        // OK: /path/to/blah
        // OK: npm-name-blah
        // NOT OK: ./rel/path/to/blah
        // Error: .blah
        if ('.' === (gconf.manager.module || '')[0]) {
            if (!gconf.packageRoot) {
                gconf.packageRoot = process.cwd();
                console.warn(
                    '`packageRoot` not defined, trying ' + gconf.packageRoot
                );
            }
            gconf.manager.module =
                gconf.packageRoot + '/' + gconf.manager.module.slice(2);
        }

        // Wraps each of the following with appropriate error checking
        // greenlock.manager.defaults
        // greenlock.sites.add
        // greenlock.sites.update
        // greenlock.sites.remove
        // greenlock.sites.find
        // greenlock.sites.get
        MngWrapper.wrap(greenlock, gconf);
        // The goal here is to reduce boilerplate, such as error checking
        // and duration parsing, that a manager must implement
        greenlock.sites.add = greenlock.add = greenlock.manager.add;
        greenlock.sites.update = greenlock.update = greenlock.manager.update;
        greenlock.sites.remove = greenlock.remove = greenlock.manager.remove;

        // Exports challenges.get for Greenlock Express HTTP-01,
        // and whatever odd use case pops up, I suppose
        // greenlock.challenges.get
        ChWrapper.wrap(greenlock);

        DIR._getDefaultDirectoryUrl('', gconf.staging, '');
        if (gconf.directoryUrl) {
            gdefaults.directoryUrl = gconf.directoryUrl;
        }

        greenlock._defaults = gdefaults;
        greenlock._defaults.debug = gconf.debug;

        if (!gconf._bin_mode && false !== gconf.renew) {
            // renew every 90-ish minutes (random for staggering)
            // the weak setTimeout (unref) means that when run as a CLI process this
            // will still finish as expected, and not wait on the timeout
            (function renew() {
                setTimeout(function() {
                    greenlock.renew({});
                    renew();
                }, Math.PI * 30 * 60 * 1000).unref();
            })();
        }
    };

    // The purpose of init is to make MCONF the source of truth
    greenlock._init = function() {
        var p;
        greenlock._init = function() {
            return p;
        };

        p = greenlock.manager
            .init({
                request: request
                //punycode: require('punycode')
            })
            .then(async function() {
                var MCONF = await greenlock.manager._defaults();
                mergeDefaults(MCONF, gconf);
                if (true === MCONF.agreeToTerms) {
                    gdefaults.agreeToTerms = function(tos) {
                        return Promise.resolve(tos);
                    };
                }

                return greenlock.manager._defaults(MCONF);
            })
            .catch(function(err) {
                if ('load_plugin' !== err.context) {
                    console.error('Fatal error during greenlock init:');
                    console.error(err.message);
                }
                if (!gconf._bin_mode) {
                    process.exit(1);
                }
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
    greenlock.get = async function(args) {
        greenlock._single(args);
        args._includePems = true;
        var results = await greenlock.renew(args);
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
    };

    // TODO remove async here, it doesn't matter
    greenlock._single = async function(args) {
        if ('string' !== typeof args.servername) {
            throw new Error('no `servername` given');
        }
        // www.example.com => *.example.com
        args.wildname =
            '*.' +
            args.servername
                .split('.')
                .slice(1)
                .join('.');
        if (args.wildname.split('.').length < 3) {
            // No '*.com'
            args.wildname = '';
        }
        if (
            args.servernames ||
            //TODO I think we need to block altnames as well, but I don't want to break anything
            //args.altnames ||
            args.subject ||
            args.renewBefore ||
            args.issueBefore ||
            args.expiresBefore
        ) {
            throw new Error(
                'bad arguments, did you mean to call greenlock.renew()?'
            );
        }
        // duplicate, force, and others still allowed
        return args;
    };

    greenlock._config = async function(args) {
        greenlock._single(args);
        var sites = await greenlock._configAll(args);
        return sites[0];
    };
    greenlock._configAll = async function(args) {
        var sites = await greenlock._find(args);
        if (!sites || !sites.length) {
            return [];
        }
        sites = JSON.parse(JSON.stringify(sites));
        var mconf = await greenlock.manager._defaults();
        return sites.map(function(site) {
            if (site.store && site.challenges) {
                return site;
            }

            var dconf = site;
            // TODO make cli and api mode the same
            if (gconf._bin_mode) {
                dconf = site.defaults = {};
            }
            if (!site.store) {
                dconf.store = mconf.store;
            }
            if (!site.challenges) {
                dconf.challenges = mconf.challenges;
            }
            return site;
        });
    };

    // needs to get info about the renewal, such as which store and challenge(s) to use
    greenlock.renew = async function(args) {
        await greenlock._init();
        var mconf = await greenlock.manager._defaults();
        return greenlock._renew(mconf, args);
    };
    greenlock._renew = async function(mconf, args) {
        if (!args) {
            args = {};
        }

        var renewedOrFailed = [];
        //console.log('greenlock._renew find', args);
        var sites = await greenlock._find(args);
        // Note: the manager must guaranteed that these are mutable copies
        //console.log('greenlock._renew found', sites);;

        if (!Array.isArray(sites)) {
            throw new Error(
                'Developer Error: not an array of sites returned from find: ' +
                    JSON.stringify(sites)
            );
        }

        await (async function next() {
            var site = sites.shift();
            if (!site) {
                return null;
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
        })();

        return renewedOrFailed;
    };

    greenlock._acme = async function(mconf, args, dirUrl) {
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

        var dir = caches[dirUrl];
        // don't cache more than an hour
        if (dir && Date.now() - dir.ts < 1 * 60 * 60 * 1000) {
            return dir.promise;
        }

        await acme.init(dirUrl).catch(function(err) {
            // TODO this is a special kind of failure mode. What should we do?
            console.error(
                "[debug] Let's Encrypt may be down for maintenance or `directoryUrl` may be wrong"
            );
            throw err;
        });

        caches[dirUrl] = {
            promise: Promise.resolve(acme),
            ts: Date.now()
        };
        return acme;
    };

    greenlock.order = async function(siteConf) {
        await greenlock._init();
        var mconf = await greenlock.manager._defaults();
        return greenlock._order(mconf, siteConf);
    };
    greenlock._order = async function(mconf, siteConf) {
        // packageAgent, maintainerEmail

        var dirUrl = DIR._getDirectoryUrl(
            siteConf.directoryUrl || mconf.directoryUrl,
            siteConf.subject
        );

        var acme = await greenlock._acme(mconf, siteConf, dirUrl);
        var storeConf = siteConf.store || mconf.store;
        storeConf = JSON.parse(JSON.stringify(storeConf));
        storeConf.packageRoot = gconf.packageRoot;

        if (!storeConf.basePath) {
            storeConf.basePath = gconf.configDir;
        }

        if ('.' === (storeConf.basePath || '')[0]) {
            if (!gconf.packageRoot) {
                gconf.packageRoot = process.cwd();
                console.warn(
                    '`packageRoot` not defined, trying ' + gconf.packageRoot
                );
            }
            storeConf.basePath = require('path').resolve(
                gconf.packageRoot || '',
                storeConf.basePath
            );
        }

        storeConf.directoryUrl = dirUrl;
        var store = await P._loadStore(storeConf);
        var account = await A._getOrCreate(
            greenlock,
            mconf,
            store.accounts,
            acme,
            siteConf
        );
        var challengeConfs = siteConf.challenges || mconf.challenges;
        var challenges = {};
        var arr = await Promise.all(
            Object.keys(challengeConfs).map(function(typ01) {
                return P._loadChallenge(challengeConfs, typ01);
            })
        );
        arr.forEach(function(el) {
            challenges[el._type] = el;
        });

        var pems = await C._getOrOrder(
            greenlock,
            mconf,
            store.certificates,
            acme,
            challenges,
            account,
            siteConf
        );
        if (!pems) {
            throw new Error('no order result');
        }
        if (!pems.privkey) {
            throw new Error('missing private key, which is kinda important');
        }

        return pems;
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

    // Load the default store module
    if (!MCONF.store) {
        if (gconf.store) {
            MCONF.store = gconf.store;
        } else {
            MCONF.store = {
                module: 'greenlock-store-fs'
            };
            console.info('[default] store.module: ' + MCONF.store.module);
        }
    }

    /*
    if ('greenlock-store-fs' === MCONF.store.module && !MCONF.store.basePath) {
        //homedir = require('os').homedir();
        if (gconf.configFile) {
            MCONF.store.basePath = gconf.configFile.replace(/\.json$/i, '.d');
        } else {
            MCONF.store.basePath = './greenlock.d';
        }
    }
    */

    // just to test that it loads
    P._loadSync(MCONF.store.module);

    // Load the default challenge modules
    var challenges = MCONF.challenges || gconf.challenges;
    if (!challenges) {
        challenges = {};
    }
    if (!challenges['http-01'] && !challenges['dns-01']) {
        challenges['http-01'] = { module: 'acme-http-01-standalone' };
        console.info(
            '[default] challenges.http-01.module: ' +
                challenges['http-01'].module
        );
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
        console.info('[default] renewOffset: ' + MCONF.renewOffset);
    }
    if (!MCONF.renewStagger) {
        MCONF.renewStagger = gconf.renewStagger || '3d';
        console.info('[default] renewStagger: ' + MCONF.renewStagger);
    }

    var vers = process.versions.node.split('.');
    var defaultKeyType = 'EC-P256';
    if (vers[0] < 10 || (vers[0] === '10' && vers[1] < '12')) {
        defaultKeyType = 'RSA-2048';
    }
    if (!MCONF.accountKeyType) {
        MCONF.accountKeyType = gconf.accountKeyType || defaultKeyType;
        console.info('[default] accountKeyType: ' + MCONF.accountKeyType);
    }
    if (!MCONF.serverKeyType) {
        MCONF.serverKeyType = gconf.serverKeyType || 'RSA-2048';
        console.info('[default] serverKeyType: ' + MCONF.serverKeyType);
    }

    if (!MCONF.subscriberEmail && false !== MCONF.subscriberEmail) {
        MCONF.subscriberEmail =
            gconf.subscriberEmail || gconf.maintainerEmail || undefined;
        MCONF.agreeToTerms = gconf.agreeToTerms || undefined;
        console.info('');
        console.info('[default] subscriberEmail: ' + MCONF.subscriberEmail);
        console.info(
            '[default] agreeToTerms: ' +
                (MCONF.agreeToTerms ||
                    gconf.agreeToTerms ||
                    '(show notice on use)')
        );
        console.info('');
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
