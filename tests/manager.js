'use strict';

var Manage = module.exports;
var sfs = require('safe-replace').create({ tmp: 'tmp', bak: 'bak' });
var promisify = require('util').promisify;
var fs = require('fs');
var readFile = promisify(fs.readFile);
var statFile = promisify(fs.stat);
var homedir = require('os').homedir();
var path = require('path');
var mkdirp = promisify(require('@root/mkdirp'));

Manage.create = function(opts) {
	if (!opts) {
		opts = {};
	}
	if (!opts.configFile) {
		opts.configFile = '~/.config/greenlock/config.json';
	}
	opts.configFile = opts.configFile.replace('~/', homedir + '/');

	var manage = {};

	manage.ping = function() {
		return Manage._ping(manage, opts);
	};

	manage._txPromise = new Promise(function(resolve) {
		resolve();
	});

	manage._lastStat = {
		size: 0,
		mtimeMs: 0
	};
	manage._config = {};

	manage._save = function(config) {
		return mkdirp(path.dirname(opts.configFile)).then(function() {
			return sfs
				.writeFileAsync(opts.configFile, JSON.stringify(config), 'utf8')
				.then(function() {
					return statFile(opts.configFile).then(function(stat) {
						manage._lastStat.size = stat.size;
						manage._lastStat.mtimeMs = stat.mtimeMs;
					});
				});
		});
	};

	manage.add = function(args) {
		manage._txPromise = manage._txPromise.then(function() {
			// if the fs has changed since we last wrote, get the lastest from disk
			return Manage._getLatest(manage, opts).then(function(config) {
				// TODO move to Greenlock.add
				var subject = args.subject || args.domain;
				var primary = subject;
				var altnames = args.altnames || args.domains;
				if ('string' !== typeof primary) {
					if (!Array.isArray(altnames) || !altnames.length) {
						throw new Error('there needs to be a subject');
					}
					primary = altnames.slice(0).sort()[0];
				}
				if (!Array.isArray(altnames) || !altnames.length) {
					altnames = [primary];
				}
				primary = primary.toLowerCase();
				altnames = altnames.map(function(name) {
					return name.toLowerCase();
				});

				if (!config.sites) {
					config.sites = {};
				}

				var site = config.sites[primary];
				if (!site) {
					site = config.sites[primary] = { altnames: [] };
				}

				// The goal is to make this decently easy to manage by hand without mistakes
				// but also reasonably easy to error check and correct
				// and to make deterministic auto-corrections

				// TODO added, removed, moved (duplicate), changed
				site.subscriberEmail = site.subscriberEmail;
				site.subject = subject;
				site.altnames = altnames;
				site.issuedAt = site.issuedAt || 0;
				site.expiresAt = site.expiresAt || 0;
				site.lastAttemptAt = site.lastAttemptAt || 0;
				// re-add if this was deleted
				site.deletedAt = 0;
				if (
					site.altnames
						.slice(0)
						.sort()
						.join() !==
					altnames
						.slice(0)
						.sort()
						.join()
				) {
					site.expiresAt = 0;
					site.issuedAt = 0;
				}

				// These should usually be empty, for most situations
				site.subscriberEmail = args.subscriberEmail;
				site.customerEmail = args.customerEmail;
				site.challenges = args.challenges;
				site.store = args.store;
				console.log('[debug] save site', site);

				return manage._save(config).then(function() {
					return JSON.parse(JSON.stringify(site));
				});
			});
		});
		return manage._txPromise;
	};

	manage.find = function(args) {
		return Manage._getLatest(manage, opts).then(function(config) {
			// i.e. find certs more than 30 days old
			//args.issuedBefore = Date.now() - 30 * 24 * 60 * 60 * 1000;
			// i.e. find certs more that will expire in less than 45 days
			//args.expiresBefore = Date.now() + 45 * 24 * 60 * 60 * 1000;
			var issuedBefore = args.issuedBefore || 0;
			var expiresBefore =
				args.expiresBefore || Date.now() + 21 * 24 * 60 * 60 * 1000;

			// TODO match ANY domain on any cert
			var sites = Object.keys(config.sites)
				.filter(function(sub) {
					var site = config.sites[sub];
					if (
						!site.deletedAt ||
						site.expiresAt < expiresBefore ||
						site.issuedAt < issuedBefore
					) {
						if (!args.subject || sub === args.subject) {
							return true;
						}
					}
				})
				.map(function(name) {
					var site = config.sites[name];
					console.debug('debug', site);
					return {
						subject: site.subject,
						altnames: site.altnames,
						issuedAt: site.issuedAt,
						expiresAt: site.expiresAt,
						renewOffset: site.renewOffset,
						renewStagger: site.renewStagger,
						renewAt: site.renewAt,
						subscriberEmail: site.subscriberEmail,
						customerEmail: site.customerEmail,
						challenges: site.challenges,
						store: site.store
					};
				});

			return sites;
		});
	};

	manage.remove = function(args) {
		if (!args.subject) {
			throw new Error('should have a subject for sites to remove');
		}
		manage._txPromise = manage.txPromise.then(function() {
			return Manage._getLatest(manage, opts).then(function(config) {
				var site = config.sites[args.subject];
				if (!site) {
					return {};
				}
				site.deletedAt = Date.now();

				return JSON.parse(JSON.stringify(site));
			});
		});
		return manage._txPromise;
	};

	manage.notifications = function(args) {
		// TODO define message types
		console.info(args.event, args.message);
	};

	manage.errors = function(err) {
		// err.subject
		// err.altnames
		// err.challenge
		// err.challengeOptions
		// err.store
		// err.storeOptions
		console.error('Failure with ', err.subject);
	};

	manage.update = function(args) {
		manage._txPromise = manage.txPromise.then(function() {
			return Manage._getLatest(manage, opts).then(function(config) {
				var site = config.sites[args.subject];
				site.issuedAt = args.issuedAt;
				site.expiresAt = args.expiresAt;
				site.renewAt = args.renewAt;
				// foo
			});
		});
		return manage._txPromise;
	};

	return manage;
};

Manage._getLatest = function(mng, opts) {
	return statFile(opts.configFile)
		.catch(function(err) {
			if ('ENOENT' === err.code) {
				return {
					size: 0,
					mtimeMs: 0
				};
			}
			err.context = 'manager_read';
			throw err;
		})
		.then(function(stat) {
			if (
				stat.size === mng._lastStat.size &&
				stat.mtimeMs === mng._lastStat.mtimeMs
			) {
				return mng._config;
			}
			return readFile(opts.configFile, 'utf8').then(function(data) {
				mng._lastStat = stat;
				mng._config = JSON.parse(data);
				return mng._config;
			});
		});
};

Manage._ping = function(mng, opts) {
	if (mng._pingPromise) {
		return mng._pingPromise;
	}

	mng._pringPromise = Promise.resolve().then(function() {
		// TODO file permissions
		if (!opts.configFile) {
			throw new Error('no config file location provided');
		}
		JSON.parse(fs.readFileSync(opts.configFile, 'utf8'));
	});
	return mng._pingPromise;
};
