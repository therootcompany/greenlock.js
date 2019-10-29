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
	//console.log('debug greenlock.manager', Object.keys(greenlock.manager));
	greenlock._init = function() {
		var p;
		greenlock._init = function() {
			return p;
		};
		p = greenlock.manager.defaults().then(function(conf) {
			var changed = false;
			if (!conf.challenges) {
				changed = true;
				conf.challenges = defaults.challenges;
			}
			if (!conf.store) {
				changed = true;
				conf.store = defaults.store;
			}
			if (changed) {
				return greenlock.manager.defaults(conf);
			}
		});
		return p;
	};

	// The goal here is to reduce boilerplate, such as error checking
	// and duration parsing, that a manager must implement
	greenlock.add = function(args) {
		return greenlock._init().then(function() {
			return greenlock._add(args);
		});
	};
	greenlock._add = function(args) {
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

		if (mng.notify || greenlock._defaults.notify) {
			try {
				var p = (mng.notify || greenlock._defaults.notify)(ev, params);
				if (p && p.catch) {
					p.catch(function(e) {
						console.error(
							"Promise Rejection on event '" + ev + "':"
						);
						console.error(e);
					});
				}
			} catch (e) {
				console.error("Thrown Exception on event '" + ev + "':");
				console.error(e);
			}
		} else {
			if (/error/i.test(ev)) {
				console.error("Error event '" + ev + "':");
				console.error(params);
				console.error(params.stack);
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
				/*
				// maintainer should be only on pre-publish, or maybe install, I think
				maintainerEmail: greenlock._defaults._maintainerEmail,
				name: greenlock._defaults._maintainerPackage,
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

	greenlock._single = function(args) {
		if (!args.servername) {
			return Promise.reject(new Error('no servername given'));
		}
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

	greenlock.get = function(args) {
		return greenlock
			._single(args)
			.then(function() {
				args._includePems = true;
				return greenlock.renew(args);
			})
			.then(function(results) {
				if (!results || !results.length) {
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

	greenlock._config = function(args) {
		return greenlock
			._single(args)
			.then(function() {
				return greenlock.manager.find(args);
			})
			.then(function(sites) {
				if (!sites || !sites.length) {
					return null;
				}
				var site = sites[0];
				site = JSON.parse(JSON.stringify(site));
				if (!site.store) {
					site.store = greenlock._defaults.store;
				}
				if (!site.challenges) {
					site.challenges = greenlock._defaults.challenges;
				}
				return site;
			});
	};

	// needs to get info about the renewal, such as which store and challenge(s) to use
	greenlock.renew = function(args) {
		return greenlock.manager.defaults().then(function(mconf) {
			return greenlock._renew(mconf, args);
		});
	};
	greenlock._renew = function(mconf, args) {
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

		if (args.servername) {
			// this doesn't have to be the subject, it can be anything
			// however, not sure how useful this really is...
			args.servername = args.servername.toLowerCase();
		}

		//console.log('greenlock._renew find', args);
		return greenlock.manager.find(args).then(function(sites) {
			// Note: the manager must guaranteed that these are mutable copies
			//console.log('greenlock._renew found', sites);

			var renewedOrFailed = [];

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
		var acme = ACME.create({
			maintainerEmail: greenlock._defaults.maintainerEmail,
			packageAgent: greenlock._defaults.packageAgent,
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
			return greenlock.manager.defaults().then(function(mconf) {
				return greenlock._order(mconf, args);
			});
		});
	};
	greenlock._order = function(mconf, args) {
		// packageAgent, maintainerEmail
		return greenlock._acme(args).then(function(acme) {
			var storeConf = args.store || greenlock._defaults.store;
			return P._loadStore(storeConf).then(function(store) {
				return A._getOrCreate(
					greenlock,
					mconf,
					store.accounts,
					acme,
					args
				).then(function(account) {
					var challengeConfs =
						args.challenges ||
						mconf.challenges ||
						greenlock._defaults.challenges;
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

G._loadChallenge = P._loadChallenge;

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

	if ('function' === typeof opts.notify) {
		defaults.notify = opts.notify;
	}

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

function errorToJSON(e) {
	var error = {};
	Object.getOwnPropertyNames(e).forEach(function(k) {
		error[k] = e[k];
	});
	return error;
}
