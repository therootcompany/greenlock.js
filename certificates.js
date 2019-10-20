'use strict';

var C = module.exports;
var U = require('./utils.js');
var CSR = require('@root/csr');
var Enc = require('@root/encoding');

var pending = {};
var rawPending = {};

// Certificates
C._getOrOrder = function(greenlock, db, acme, challenges, account, args) {
	var email = args.subscriberEmail || greenlock._defaults.subscriberEmail;

	var id = args.altnames.join(' ');
	if (pending[id]) {
		return pending[id];
	}

	pending[id] = C._rawGetOrOrder(
		greenlock,
		db,
		acme,
		challenges,
		account,
		email,
		args
	)
		.then(function(pems) {
			delete pending[id];
			return pems;
		})
		.catch(function(err) {
			delete pending[id];
			throw err;
		});

	return pending[id];
};

// Certificates
C._rawGetOrOrder = function(
	greenlock,
	db,
	acme,
	challenges,
	account,
	email,
	args
) {
	return C._check(db, args).then(function(pems) {
		// No pems? get some!
		if (!pems) {
			return C._rawOrder(
				greenlock,
				db,
				acme,
				challenges,
				account,
				email,
				args
			).then(function(newPems) {
				// do not wait on notify
				greenlock._notify('cert_issue', {
					options: args,
					subject: args.subject,
					altnames: args.altnames,
					account: account,
					email: email,
					pems: newPems
				});
				return newPems;
			});
		}

		// Nice and fresh? We're done!
		if (!C._isStale(greenlock, args, pems)) {
			// return existing unexpired (although potentially stale) certificates when available
			// there will be an additional .renewing property if the certs are being asynchronously renewed
			//pems._type = 'current';
			return pems;
		}

		// Getting stale? Let's renew to freshen up!
		var p = C._rawOrder(
			greenlock,
			db,
			acme,
			challenges,
			account,
			email,
			args
		).then(function(renewedPems) {
			// do not wait on notify
			greenlock._notify('cert_renewal', {
				options: args,
				subject: args.subject,
				altnames: args.altnames,
				account: account,
				email: email,
				pems: renewedPems
			});
			return renewedPems;
		});

		// TODO what should this be?
		if (args.waitForRenewal) {
			return p;
		}

		return pems;
	});
};

// we have another promise here because it the optional renewal
// may resolve in a different stack than the returned pems
C._rawOrder = function(greenlock, db, acme, challenges, account, email, args) {
	var id = args.altnames
		.slice(0)
		.sort()
		.join(' ');
	if (rawPending[id]) {
		return rawPending[id];
	}

	var keyType = args.serverKeyType || greenlock._defaults.serverKeyType;
	var query = {
		subject: args.subject,
		certificate: args.certificate || {}
	};
	rawPending[id] = U._getOrCreateKeypair(db, args.subject, query, keyType)
		.then(function(kresult) {
			var serverKeypair = kresult.keypair;
			var domains = args.altnames.slice(0);

			return CSR.csr({
				jwk: serverKeypair.privateKeyJwk,
				domains: domains,
				encoding: 'der'
			})
				.then(function(csrDer) {
					// TODO let CSR support 'urlBase64' ?
					return Enc.bufToUrlBase64(csrDer);
				})
				.then(function(csr) {
					function notify() {
						greenlock._notify('challenge_status', {
							options: args,
							subject: args.subject,
							altnames: args.altnames,
							account: account,
							email: email
						});
					}
					var certReq = {
						debug: args.debug || greenlock._defaults.debug,

						challenges: challenges,
						account: account, // only used if accounts.key.kid exists
						accountKeypair: account.keypair,
						keypair: account.keypair, // TODO
						csr: csr,
						domains: domains, // because ACME.js v3 uses `domains` still, actually
						onChallengeStatus: notify,
						notify: notify // TODO

						// TODO handle this in acme-v2
						//subject: args.subject,
						//altnames: args.altnames.slice(0),
					};
					return acme.certificates
						.create(certReq)
						.then(U._attachCertInfo);
				})
				.then(function(pems) {
					if (kresult.exists) {
						return pems;
					}
					query.keypair = serverKeypair;
					return db.setKeypair(query, serverKeypair).then(function() {
						return pems;
					});
				});
		})
		.then(function(pems) {
			// TODO put this in the docs
			// { cert, chain, privkey, subject, altnames, issuedAt, expiresAt }
			// Note: the query has been updated
			query.pems = pems;
			return db.set(query);
		})
		.then(function() {
			return C._check(db, args);
		})
		.then(function(bundle) {
			// TODO notify Manager
			delete rawPending[id];
			return bundle;
		})
		.catch(function(err) {
			// Todo notify manager
			delete rawPending[id];
			throw err;
		});

	return rawPending[id];
};

// returns pems, if they exist
C._check = function(db, args) {
	var query = {
		subject: args.subject,
		// may contain certificate.id
		certificate: args.certificate
	};
	return db.check(query).then(function(pems) {
    console.log('[debug] has pems? (yes)', pems);
		if (!pems) {
			return null;
		}

		pems = U._attachCertInfo(pems);

		// For eager management
		if (args.subject && !U._certHasDomain(pems, args.subject)) {
			// TODO report error, but continue the process as with no cert
			return null;
		}

		// For lazy SNI requests
		if (args.domain && !U._certHasDomain(pems, args.domain)) {
			// TODO report error, but continue the process as with no cert
			return null;
		}

		return U._getKeypair(db, args.subject, query)
			.then(function(keypair) {
        console.log('[debug get keypair]', Object.keys(keypair));
				pems.privkey = keypair.privateKeyPem;
				return pems;
			})
			.catch(function() {
				// TODO report error, but continue the process as with no cert
				return null;
			});
	});
};

// Certificates
C._isStale = function(greenlock, args, pems) {
	if (args.duplicate) {
		return true;
	}

	var renewAt = C._renewableAt(greenlock, args, pems);

	if (Date.now() >= renewAt) {
		return true;
	}

	return false;
};

C._renewableAt = function(greenlock, args, pems) {
	if (args.renewAt) {
		return args.renewAt;
	}

	var renewOffset = args.renewOffset || greenlock._defaults.renewOffset || 0;
	var week = 1000 * 60 * 60 * 24 * 6;
	if (!args.force && Math.abs(renewOffset) < week) {
		throw new Error(
			'developer error: `renewOffset` should always be at least a week, use `force` to not safety-check renewOffset'
		);
	}

	if (renewOffset > 0) {
		return pems.issuedAt + renewOffset;
	}

	return pems.expiresAt + renewOffset;
};
