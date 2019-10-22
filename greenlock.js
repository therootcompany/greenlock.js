'use strict';

var pkg = require('./package.json');

var ACME = require('@root/acme');
var Greenlock = module.exports;
var homedir = require('os').homedir();

var G = Greenlock;
var U = require('./utils.js');
var E = require('./errors.js');
var P = require('./plugins.js');
var A = require('./accounts.js');
var C = require('./certificates.js');
var UserEvents = require('./user-events.js');

var promisify = require('util').promisify;

var caches = {};

// { maintainerEmail, directoryUrl, subscriberEmail, store, challenges  }
G.create = function(gconf) {
	var greenlock = {};
	if (!gconf) {
		gconf = {};
	}

	if (!gconf.maintainerEmail) {
		throw E.NO_MAINTAINER('create');
	}

	// TODO send welcome message with benefit info
	U._validMx(gconf.maintainerEmail).catch(function() {
		console.error(
			'invalid maintainer contact info:',
			gconf.maintainer.Email
		);
		// maybe a little harsh?
		process.exit(1);
	});

	// TODO default servername is GLE only

	if (!gconf.manager) {
		gconf.manager = 'greenlock-manager-fs';
	}

	var Manager;
	if ('string' === typeof gconf.manager) {
		try {
			Manager = require(gconf.manager);
		} catch (e) {
			if ('MODULE_NOT_FOUND' !== e.code) {
				throw e;
			}
			console.error(e.code);
			console.error(e.message);
			console.error(gconf.manager);
			P._installSync(gconf.manager);
			Manager = require(gconf.manager);
		}
	}

	// minimal modification to the original object
	var defaults = G._defaults(gconf);

	greenlock.manager = Manager.create(defaults);

	// The goal here is to reduce boilerplate, such as error checking
	// and duration parsing, that a manager must implement
	greenlock.add = function(args) {
		return Promise.resolve().then(function() {
			// durations
			if (args.renewOffset) {
				args.renewOffset = U._parseDuration(args.renewOffset);
			}
			if (args.renewStagger) {
				args.renewStagger = U._parseDuration(args.renewStagger);
			}

			if (!args.subject) {
				throw E.NO_SUBJECT('add');
			}

			if (!args.altnames) {
				args.altnames = [args.subject];
			}
			if ('string' === typeof args.altnames) {
				args.altnames = args.altnames.split(/[,\s]+/);
			}
			if (args.subject !== args.altnames[0]) {
				throw E.BAD_ORDER(
					'add',
					'(' + args.subject + ") '" + args.altnames.join("' '") + "'"
				);
			}
			args.altnames = args.altnames.map(U._encodeName);

			if (
				!args.altnames.every(function(d) {
					return U._validName(d);
				})
			) {
				throw E.INVALID_HOSTNAME(
					'add',
					"'" + args.altnames.join("' '") + "'"
				);
			}

			// at this point we know that subject is the first of altnames
			return Promise.all(
				args.altnames.map(function(d) {
					d = d.replace('*.', '');
					return U._validDomain(d);
				})
			).then(function() {
				if (!U._uniqueNames(args.altnames)) {
					throw E.NOT_UNIQUE(
						'add',
						"'" + args.altnames.join("' '") + "'"
					);
				}

				return greenlock.manager.add(args);
			});
		});
	};

	greenlock._notify = function(ev, params) {
		var mng = greenlock.manager;
		if (mng.notif || greenlock._defaults.notify) {
			try {
				var p = (mng.notify || greenlock._defaults.notify)(ev, params);
				if (p && p.catch) {
					p.catch(function(e) {
						console.error("Error on event '" + ev + "':");
						console.error(e);
					});
				}
			} catch (e) {
				console.error("Error on event '" + ev + "':");
				console.error(e);
			}
		} else {
			if (/error/i.test(ev)) {
				console.error("Error event '" + ev + "':");
				console.error(params);
			}
		}
		/*
     *'cert_issue', {
						options: args,
						subject: args.subject,
						altnames: args.altnames,
						account: account,
						email: email,
						pems: newPems
					}
     */

		if (-1 !== ['cert_issue', 'cert_renewal'].indexOf(ev)) {
			// We will notify all greenlock users of mandatory and security updates
			// We'll keep track of versions and os so we can make sure things work well
			// { name, version, email, domains, action, communityMember, telemetry }
			// TODO look at the other one
			UserEvents.notify({
				// maintainer should be only on pre-publish, or maybe install, I think
				maintainerEmail: greenlock._defaults._maintainerEmail,
				name: greenlock._defaults._maintainerPackage,
				version: greenlock._defaults._maintainerPackageVersion,
				action: params.pems._type,
				domains: params.altnames,
				subscriberEmail: greenlock._defaults._subscriberEmail,
				// TODO enable for Greenlock Pro
				//customerEmail: args.customerEmail
				telemetry: greenlock._defaults.telemetry
			});
		}
	};

	// needs to get info about the renewal, such as which store and challenge(s) to use
	greenlock.renew = function(args) {
		if (!args) {
			args = {};
		}

		// durations
		if (args.renewOffset) {
			args.renewOffset = U._parseDuration(args.renewOffset);
		}
		if (args.renewStagger) {
			args.renewStagger = U._parseDuration(args.renewStagger);
		}

		if (args.domain) {
			// this doesn't have to be the subject, it can be anything
			// however, not sure how useful this really is...
			args.domain = args.toLowerCase();
		}

		args.defaults = greenlock.defaults;
		return greenlock.manager.find(args).then(function(sites) {
			// Note: the manager must guaranteed that these are mutable copies

			var renewedOrFailed = [];

			function next() {
				var site = sites.shift();
				if (!site) {
					return null;
				}

				var order = {
					site: site
				};
				renewedOrFailed.push(order);
				// TODO merge args + result?
				return greenlock
					.order(site)
					.then(function(pems) {
						order.pems = pems;
					})
					.catch(function(err) {
						order.error = err;
						greenlock._notify('order_error', order);
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
		var acme = ACME.create({
			debug: args.debug
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
		return greenlock._acme(args).then(function(acme) {
			var storeConf = args.store || greenlock._defaults.store;
			return P._load(storeConf.module).then(function(plugin) {
				var store = Greenlock._normalizeStore(
					storeConf.module,
					plugin.create(storeConf)
				);

				return A._getOrCreate(
					greenlock,
					store.accounts,
					acme,
					args
				).then(function(account) {
					var challengeConfs =
						args.challenges || greenlock._defaults.challenges;
					console.log('[debug] challenge confs', challengeConfs);
					return Promise.all(
						Object.keys(challengeConfs).map(function(typ01) {
							var chConf = challengeConfs[typ01];
							console.log('[debug] module', chConf);
							return P._load(chConf.module).then(function(
								plugin
							) {
								var ch = Greenlock._normalizeChallenge(
									chConf.module,
									plugin.create(chConf)
								);
								ch._type = typ01;
								return ch;
							});
						})
					).then(function(arr) {
						var challenges = {};
						arr.forEach(function(el) {
							challenges[el._type] = el;
						});
						return C._getOrOrder(
							greenlock,
							store.certificates,
							acme,
							challenges,
							account,
							args
						).then(function(pems) {
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

	greenlock._options = gconf;
	greenlock._defaults = defaults;

	if (!gconf.onOrderFailure) {
		gconf.onOrderFailure = function(err) {
			G._onOrderFailure(gconf, err);
		};
	}

	return greenlock;
};

G._defaults = function(opts) {
	var defaults = {};

	// [ 'store', 'challenges' ]
	Object.keys(opts).forEach(function(k) {
		// manage is the only thing that is, potentially, not plain-old JSON
		if ('manage' === k && 'string' !== typeof opts[k]) {
			return;
		}
		defaults[k] = opts[k];
	});

	if (!defaults._maintainerPackage) {
		defaults._maintainerPackage = pkg.name;
		defaults._maintainerPackageVersion = pkg.version;
	}

	if (!defaults.directoryUrl) {
		if (defaults.staging) {
			defaults.directoryUrl =
				'https://acme-staging-v02.api.letsencrypt.org/directory';
		} else {
			defaults.directoryUrl =
				'https://acme-v02.api.letsencrypt.org/directory';
		}
	} else {
		if (defaults.staging) {
			throw new Error('supply `directoryUrl` or `staging`, but not both');
		}
	}
	console.info('ACME Directory URL:', defaults.directoryUrl);

	// Load the default store module
	if (!defaults.store) {
		defaults.store = {
			module: 'greenlock-store-fs',
			basePath: homedir + '/.config/greenlock/'
		};
	}
	P._loadSync(defaults.store.module);
	//defaults.store = store;

	// Load the default challenge modules
	var challenges;
	if (!defaults.challenges) {
		defaults.challenges = {};
	}
	challenges = defaults.challenges;

	// TODO provide http-01 when http-01 and/or(?) dns-01 don't exist
	if (!challenges['http-01'] && !challenges['dns-01']) {
		challenges['http-01'] = {
			module: 'acme-http-01-standalone'
		};
	}

	if (challenges['http-01']) {
		if ('string' === typeof challenges['http-01'].module) {
			P._loadSync(challenges['http-01'].module);
		}
	}

	if (challenges['dns-01']) {
		if ('string' === typeof challenges['dns-01'].module) {
			P._loadSync(challenges['dns-01'].module);
		}
	}

	if (defaults.agreeToTerms === true || defaults.agreeTos === true) {
		defaults.agreeToTerms = function(tos) {
			return Promise.resolve(tos);
		};
	}

	if (!defaults.renewOffset) {
		defaults.renewOffset = '-45d';
	}
	if (!defaults.renewStagger) {
		defaults.renewStagger = '3d';
	}

	if (!defaults.accountKeyType) {
		defaults.accountKeyType = 'EC-P256';
	}
	if (!defaults.serverKeyType) {
		if (defaults.domainKeyType) {
			console.warn('use serverKeyType instead of domainKeyType');
			defaults.serverKeyType = defaults.domainKeyType;
		} else {
			defaults.serverKeyType = 'RSA-2048';
		}
	}
	if (defaults.domainKeypair) {
		console.warn('use serverKeypair instead of domainKeypair');
		defaults.serverKeypair =
			defaults.serverKeypair || defaults.domainKeypair;
	}

	Object.defineProperty(defaults, 'domainKeypair', {
		write: false,
		get: function() {
			console.warn('use serverKeypair instead of domainKeypair');
			return defaults.serverKeypair;
		}
	});

	return defaults;
};

Greenlock._normalizeStore = function(name, store) {
	var acc = store.accounts;
	var crt = store.certificates;

	var warned = false;
	function warn() {
		if (warned) {
			return;
		}
		warned = true;
		console.warn(
			"'" +
				name +
				"' may have incorrect function signatures, or contains deprecated use of callbacks"
		);
	}

	// accs
	if (acc.check && 2 === acc.check.length) {
		warn();
		acc._thunk_check = acc.check;
		acc.check = promisify(acc._thunk_check);
	}
	if (acc.set && 3 === acc.set.length) {
		warn();
		acc._thunk_set = acc.set;
		acc.set = promisify(acc._thunk_set);
	}
	if (2 === acc.checkKeypair.length) {
		warn();
		acc._thunk_checkKeypair = acc.checkKeypair;
		acc.checkKeypair = promisify(acc._thunk_checkKeypair);
	}
	if (3 === acc.setKeypair.length) {
		warn();
		acc._thunk_setKeypair = acc.setKeypair;
		acc.setKeypair = promisify(acc._thunk_setKeypair);
	}

	// certs
	if (2 === crt.check.length) {
		warn();
		crt._thunk_check = crt.check;
		crt.check = promisify(crt._thunk_check);
	}
	if (3 === crt.set.length) {
		warn();
		crt._thunk_set = crt.set;
		crt.set = promisify(crt._thunk_set);
	}
	if (2 === crt.checkKeypair.length) {
		warn();
		crt._thunk_checkKeypair = crt.checkKeypair;
		crt.checkKeypair = promisify(crt._thunk_checkKeypair);
	}
	if (2 === crt.setKeypair.length) {
		warn();
		crt._thunk_setKeypair = crt.setKeypair;
		crt.setKeypair = promisify(crt._thunk_setKeypair);
	}

	return store;
};

Greenlock._normalizeChallenge = function(name, ch) {
	var warned = false;
	function warn() {
		if (warned) {
			return;
		}
		warned = true;
		console.warn(
			"'" +
				name +
				"' may have incorrect function signatures, or contains deprecated use of callbacks"
		);
	}

	// init, zones, set, get, remove
	if (ch.init && 2 === ch.init.length) {
		warn();
		ch._thunk_init = ch.init;
		ch.init = promisify(ch._thunk_init);
	}
	if (ch.zones && 2 === ch.zones.length) {
		warn();
		ch._thunk_zones = ch.zones;
		ch.zones = promisify(ch._thunk_zones);
	}
	if (2 === ch.set.length) {
		warn();
		ch._thunk_set = ch.set;
		ch.set = promisify(ch._thunk_set);
	}
	if (2 === ch.remove.length) {
		warn();
		ch._thunk_remove = ch.remove;
		ch.remove = promisify(ch._thunk_remove);
	}
	if (ch.get && 2 === ch.get.length) {
		warn();
		ch._thunk_get = ch.get;
		ch.get = promisify(ch._thunk_get);
	}

	return ch;
};
