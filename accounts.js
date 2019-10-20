'use strict';

var A = module.exports;
var U = require('./utils.js');
var E = require('./errors.js');

var pending = {};

A._getOrCreate = function(greenlock, db, acme, args) {
	var email = args.subscriberEmail || greenlock._defaults.subscriberEmail;

	if (!email) {
		throw E.NO_SUBSCRIBER('get account', args.subject);
	}

	// TODO send welcome message with benefit info
	return U._validMx(email)
		.catch(function() {
			throw E.NO_SUBSCRIBER('get account', args.subcriberEmail);
		})
		.then(function() {
			if (pending[email]) {
				return pending[email];
			}

			pending[email] = A._rawGetOrCreate(greenlock, db, acme, args, email)
				.catch(function(e) {
					delete pending[email];
					throw e;
				})
				.then(function(result) {
					delete pending[email];
					return result;
				});

			return pending[email];
		});
};

// What we really need out of this is the private key and the ACME "key" id
A._rawGetOrCreate = function(greenlock, db, acme, args, email) {
	var p;
	if (db.check) {
		p = A._checkStore(greenlock, db, acme, args, email);
	} else {
		p = Promise.resolve(null);
	}

	return p.then(function(fullAccount) {
		if (!fullAccount) {
			return A._newAccount(greenlock, db, acme, args, email, null);
		}

		if (fullAccount.keypair && fullAccount.key && fullAccount.key.kid) {
			return fullAccount;
		}

		return A._newAccount(greenlock, db, acme, args, email, fullAccount);
	});
};

A._newAccount = function(greenlock, db, acme, args, email, fullAccount) {
	var keyType = args.accountKeyType || greenlock._defaults.accountKeyType;
	var query = {
		subject: args.subject,
		email: email,
		account: fullAccount || {}
	};

	return U._getOrCreateKeypair(db, args.subject, query, keyType).then(
		function(kresult) {
			var keypair = kresult.keypair;
			var accReg = {
				subscriberEmail: email,
				agreeToTerms:
					args.agreeToTerms || greenlock._defaults.agreeToTerms,
				accountKeypair: keypair,
				debug: args.debug
			};
			return acme.accounts.create(accReg).then(function(receipt) {
				var reg = {
					keypair: keypair,
					receipt: receipt,
					// shudder... not actually a KeyID... but so it is called anyway...
					kid:
						receipt &&
						receipt.key &&
						(receipt.key.kid || receipt.kid),
					email: args.email
				};

				var keyP;
				if (kresult.exists) {
					keyP = Promise.resolve();
				} else {
					query.keypair = keypair;
					query.receipt = receipt;
					keyP = db.setKeypair(query, keypair);
				}

				return keyP
					.then(function() {
						if (!db.set) {
							return Promise.resolve({
								keypair: keypair
							});
						}
						return db.set(
							{
								// id to be set by Store
								email: email,
								agreeTos: true
							},
							reg
						);
					})
					.then(function(fullAccount) {
						if (fullAccount && 'object' !== typeof fullAccount) {
							throw new Error(
								"accounts.set should either return 'null' or an object with an 'id' string"
							);
						}

						if (!fullAccount) {
							fullAccount = {};
						}
						fullAccount.keypair = keypair;
						if (!fullAccount.key) {
							fullAccount.key = {};
						}
						fullAccount.key.kid = reg.kid;

						return fullAccount;
					});
			});
		}
	);
};

A._checkStore = function(greenlock, db, acme, args, email) {
	if ((args.domain || args.domains) && !args.subject) {
		console.warn("use 'subject' instead of 'domain'");
		args.subject = args.domain;
	}

	var account = args.account;
	if (!account) {
		account = {};
	}

	if (args.accountKeypair) {
		console.warn(
			'rather than passing accountKeypair, put it directly into your account key store'
		);
		// TODO we probably don't need this
		return U._importKeypair(args.accountKeypair);
	}

	if (!db.check) {
		return Promise.resolve(null);
	}

	return db
		.check({
			//keypair: undefined,
			//receipt: undefined,
			email: email,
			account: account
		})
		.then(function(fullAccount) {
			if (!fullAccount) {
				return null;
			}

			return fullAccount;
		});
};
