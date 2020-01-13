'use strict';

var U = require('../utils.js');
var E = require('../errors.js');

var warned = {};

// The purpose of this file is to try to auto-build
// partial managers so that the external API can be smaller.

module.exports.wrap = function(greenlock, gconf) {
    var myFind = gconf.find;
    delete gconf.find;

    var mega = mergeManager(greenlock, gconf);

    greenlock.manager = {};
    greenlock.sites = {};
    //greenlock.accounts = {};
    //greenlock.certs = {};

    greenlock.manager._modulename = gconf.manager.module;
    if ('/' === String(gconf.manager.module)[0]) {
        greenlock.manager._modulename = require('path').relative(
            gconf.packageRoot,
            greenlock.manager._modulename
        );
        if ('.' !== String(greenlock.manager._modulename)[0]) {
            greenlock.manager._modulename =
                './' + greenlock.manager._modulename;
        }
    }

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
                return mega.defaults();
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

            return mega.defaults(conf);
        });
    };

    greenlock.manager._defaults = function(opts) {
        return mega.defaults(opts);
    };

    greenlock.manager.add = function(args) {
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

                return mega.set(args).then(function(result) {
                    if (!gconf._bin_mode) {
                        greenlock.renew({}).catch(function(err) {
                            if (!err.context) {
                                err.contxt = 'renew';
                            }
                            greenlock._notify('error', err);
                        });
                    }
                    return result;
                });
            });
        });
    };

    greenlock.manager.get = greenlock.sites.get = function(args) {
        return Promise.resolve().then(function() {
            if (args.subject) {
                throw new Error(
                    'get({ servername }) searches certificates by altnames, not by subject specifically'
                );
            }
            if (args.servernames || args.altnames || args.renewBefore) {
                throw new Error(
                    'get({ servername }) does not take arguments that could lead to multiple results'
                );
            }
            return mega.get(args);
        });
    };

    greenlock.manager.remove = function(args) {
        return Promise.resolve().then(function() {
            args.subject = checkSubject(args);
            if (args.servername) {
                throw new Error(
                    'remove() should be called with `subject` only, if you wish to remove altnames use `update()`'
                );
            }
            if (args.altnames) {
                throw new Error(
                    'remove() should be called with `subject` only, not `altnames`'
                );
            }
            // TODO check no altnames
            return mega.remove(args);
        });
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

    // no transaction promise here because it calls set
    greenlock._find = async function(args) {
        args = _mangleFindArgs(args);
        var ours = await mega.find(args);
        if (!myFind) {
            return ours;
        }

        // if the user has an overlay find function we'll do a diff
        // between the managed state and the overlay, and choose
        // what was found.
        var theirs = await myFind(args);
        theirs = theirs.filter(function(site) {
            if (!site || 'string' !== typeof site.subject) {
                throw new Error('found site is missing subject');
            }
            if (
                !Array.isArray(site.altnames) ||
                !site.altnames.length ||
                !site.altnames[0] ||
                site.altnames[0] !== site.subject
            ) {
                throw new Error('missing or malformed altnames');
            }
            ['renewAt', 'issuedAt', 'expiresAt'].forEach(function(k) {
                if (site[k]) {
                    throw new Error(
                        '`' +
                            k +
                            '` should be updated by `set()`, not by `find()`'
                    );
                }
            });
            if (!site) {
                return;
            }
            if (args.subject && site.subject !== args.subject) {
                return false;
            }

            var servernames = args.servernames || args.altnames;
            if (
                servernames &&
                !site.altnames.some(function(altname) {
                    return servernames.includes(altname);
                })
            ) {
                return false;
            }

            return site.renewAt < (args.renewBefore || Infinity);
        });
        return _mergeFind(ours, theirs);
    };

    function _mergeFind(ours, theirs) {
        var toUpdate = [];
        theirs.forEach(function(_newer) {
            var hasCurrent = ours.some(function(_older) {
                var changed = false;
                if (_newer.subject !== _older.subject) {
                    return false;
                }

                // BE SURE TO SET THIS UNDEFINED AFTERWARDS
                _older._exists = true;

                _newer.deletedAt = _newer.deletedAt || 0;
                Object.keys(_newer).forEach(function(k) {
                    if (_older[k] !== _newer[k]) {
                        changed = true;
                        _older[k] = _newer[k];
                    }
                });
                if (changed) {
                    toUpdate.push(_older);
                }

                // handled the (only) match
                return true;
            });
            if (!hasCurrent) {
                toUpdate.push(_newer);
            }
        });

        // delete the things that are gone
        ours.forEach(function(_older) {
            if (!_older._exists) {
                _older.deletedAt = Date.now();
                toUpdate.push(_older);
            }
            _older._exists = undefined;
        });

        Promise.all(
            toUpdate.map(function(site) {
                return greenlock.sites.update(site).catch(function(err) {
                    console.error(
                        'Developer Error: cannot update sites from user-supplied `find()`:'
                    );
                    console.error(err);
                });
            })
        );

        // ours is updated from theirs
        return ours;
    }

    greenlock.manager.init = mega.init;
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

    // punycode BEFORE validation
    // (set, find, remove)
    if (altnames.join() !== args.altnames.join()) {
        console.warn(
            'all domains in `altnames` must be lowercase:',
            args.altnames
        );
    }

    args.altnames = args.altnames.map(U._encodeName);
    if (
        !args.altnames.every(function(d) {
            return U._validName(d);
        })
    ) {
        throw E.INVALID_HOSTNAME('add', "'" + args.altnames.join("' '") + "'");
    }

    if (subject && subject !== args.altnames[0]) {
        throw E.BAD_ORDER(
            'add',
            '(' + args.subject + ") '" + args.altnames.join("' '") + "'"
        );
    }
    /*
    if (subject && subject !== altnames[0]) {
        throw new Error(
            '`subject` must be the first domain in `altnames`',
            args.subject,
            altnames.join(' ')
        );
    }
    */

    return altnames;
}

function loadManager(gconf) {
    var m;
    // 1. Get the manager
    // 2. Figure out if we need to wrap it

    /*
    if (!gconf.manager) {
        gconf.manager = '@greenlock/manager';
    }

    if ('string' !== typeof gconf.manager) {
        throw new Error(
            '`manager` should be a string representing the npm name or file path of the module'
        );
    }
    */

    try {
        // wrap this to be safe for @greenlock/manager
        m = require(gconf.manager.module).create(gconf.manager);
    } catch (e) {
        console.error('Error loading manager:');
        console.error(e.code);
        console.error(e.message);
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

    return m;
}

function mergeManager(greenlock, gconf) {
    var mng;
    function m() {
        if (mng) {
            return mng;
        }
        mng = require('@greenlock/manager').create(gconf);
        return mng;
    }

    var mini = loadManager(gconf);
    var mega = {};
    // optional
    if (mini.defaults) {
        mega.defaults = function(opts) {
            return mini.defaults(opts);
        };
    } else {
        mega.defaults = m().defaults;
    }

    // optional
    if (mini.remove) {
        mega.remove = function(opts) {
            return mini.remove(opts);
        };
    } else {
        mega.remove = function(opts) {
            mega.get(opts).then(function(site) {
                if (!site) {
                    return null;
                }
                site.deletedAt = Date.now();
                return mega.set(site).then(function() {
                    return site;
                });
            });
        };
    }

    if (mini.find) {
        // without this there cannot be fully automatic renewal
        mega.find = function(opts) {
            return mini.find(opts);
        };
    }

    // set and (find and/or get) should be from the same set
    if (mini.set) {
        mega.set = function(opts) {
            if (!mini.find) {
                // TODO create the list so that find can be implemented
            }
            return mini.set(opts);
        };
    } else {
        mega.set = m().set;
        mega.get = m().get;
    }

    if (mini.get) {
        mega.get = async function(opts) {
            if (mini.set) {
                return mini.get(opts);
            }

            if (!mega._get) {
                mega._get = m().get;
            }

            var existing = await mega._get(opts);
            var site = await mini.get(opts);
            if (!existing) {
                // Add
                if (!site) {
                    return;
                }
                site.renewAt = 1;
                site.deletedAt = 0;
                await mega.set(site);
                existing = await mega._get(opts);
            } else if (!site) {
                // Delete
                existing.deletedAt = site.deletedAt || Date.now();
                await mega.set(existing);
                existing = null;
            } else if (
                site.subject !== existing.subject ||
                site.altnames.join(' ') !== existing.altnames.join(' ')
            ) {
                // Update
                site.renewAt = 1;
                site.deletedAt = 0;
                await mega.set(site);
                existing = await mega._get(opts);
                if (!existing) {
                    throw new Error('failed to `get` after `set`');
                }
            }

            return existing;
        };
    } else if (mini.find) {
        mega.get = function(opts) {
            var servername = opts.servername;
            delete opts.servername;
            opts.servernames = (servername && [servername]) || undefined;
            return mini.find(opts).then(function(sites) {
                return sites.filter(function(site) {
                    return site.altnames.include(servername);
                })[0];
            });
        };
    } else if (mini.set) {
        throw new Error(
            gconf.manager.module +
                ' implements `set()`, but not `get()` or `find()`'
        );
    } else {
        mega.find = m().find;
        mega.get = m().get;
    }

    if (!mega.find) {
        mega._nofind = false;
        mega.find = async function(opts) {
            if (!mega._nofind) {
                console.warn(
                    'Warning: manager `' +
                        greenlock.manager._modulename +
                        '` does not implement `find({})`\n'
                );
                mega._nofind = true;
            }
            return [];
        };
    }

    if (!mega.get) {
        mega.get = function(opts) {
            var servername = opts.servername;
            delete opts.servername;
            opts.servernames = (servername && [servername]) || undefined;
            return mega.find(opts).then(function(sites) {
                return sites.filter(function(site) {
                    return site.altnames.include(servername);
                })[0];
            });
        };
    }

    mega.init = function(deps) {
        if (mini.init) {
            return mini.init(deps).then(function() {
                if (mng) {
                    return mng.init(deps);
                }
            });
        } else if (mng) {
            return mng.init(deps);
        } else {
            return Promise.resolve(null);
        }
    };

    return mega;
}

function _mangleFindArgs(args) {
    var servernames = (args.servernames || [])
        .concat(args.altnames || [])
        .filter(Boolean)
        .slice(0);
    var modified = servernames.slice(0);

    // servername, wildname, and altnames are all the same
    ['wildname', 'servername'].forEach(function(k) {
        var altname = args[k] || '';
        if (altname && !modified.includes(altname)) {
            modified.push(altname);
        }
    });

    if (modified.length) {
        servernames = modified;
        servernames = servernames.map(U._encodeName);
        args.altnames = servernames;
        args.servernames = args.altnames = checkAltnames(false, args);
    }

    // documented as args.servernames
    // preserved as args.altnames for v3 beta backwards compat
    // my only hesitancy in this choice is that a "servername"
    // may NOT contain '*.', in which case `altnames` is a better choice.
    // However, `altnames` is ambiguous - as if it means to find a
    // certificate by that specific collection of altnames.
    // ... perhaps `domains` could work?
    return args;
}
