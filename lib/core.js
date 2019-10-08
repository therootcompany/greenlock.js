'use strict';
/*global Promise*/
require('./compat.js');

var util = require('util');
function promisifyAll(obj) {
	var aobj = {};
	Object.keys(obj).forEach(function(key) {
		if ('function' === typeof obj[key]) {
			aobj[key] = obj[key];
			aobj[key + 'Async'] = util.promisify(obj[key]);
		}
	});
	return aobj;
}

function _log(debug) {
	if (debug) {
		var args = Array.prototype.slice.call(arguments);
		args.shift();
		args.unshift('[greenlock/lib/core.js]');
		console.log.apply(console, args);
	}
}

module.exports.create = function(gl) {
	var utils = require('./utils');
	var RSA = promisifyAll(require('rsa-compat').RSA);
	var log = gl.log || _log; // allow custom log
	var pendingRegistrations = {};

	var core = {
		//
		// Helpers
		//
		getAcmeUrlsAsync: function(args) {
			var now = Date.now();

			// TODO check response header on request for cache time
			if (now - gl._ipc.acmeUrlsUpdatedAt < 10 * 60 * 1000) {
				return Promise.resolve(gl._ipc.acmeUrls);
			}

			// TODO acme-v2/nocompat
			return gl.acme.getAcmeUrlsAsync(args.server).then(function(data) {
				gl._ipc.acmeUrlsUpdatedAt = Date.now();
				gl._ipc.acmeUrls = data;

				return gl._ipc.acmeUrls;
			});
		},

		//
		// The Main Enchilada
		//

		//
		// Accounts
		//
		accounts: {
			// Accounts
			registerAsync: function(args) {
				var err;
				var copy = utils.merge(args, gl);
				var disagreeTos;
				args = utils.tplCopy(copy);
				if (!args.account) {
					args.account = {};
				}
				if ('object' === typeof args.account && !args.account.id) {
					args.account.id = args.accountId || args.email || '';
				}

				disagreeTos =
					!args.agreeTos && 'undefined' !== typeof args.agreeTos;
				if (
					!args.email ||
					disagreeTos ||
					parseInt(args.rsaKeySize, 10) < 2048
				) {
					err = new Error(
						"In order to register an account both 'email' and 'agreeTos' must be present" +
							" and 'rsaKeySize' must be 2048 or greater."
					);
					err.code = 'E_ARGS';
					return Promise.reject(err);
				}

				return utils.testEmail(args.email).then(function() {
					if (
						args.account &&
						args.account.privkey &&
						(args.account.privkey.jwk || args.account.privkey.pem)
					) {
						// TODO import jwk or pem and return it here
						console.warn(
							'TODO: implement accounts.checkKeypairAsync skipping'
						);
					}
					var accountKeypair;
					var newAccountKeypair = true;
					var promise = gl.store.accounts
						.checkKeypairAsync(args)
						.then(function(keypair) {
							if (keypair) {
								// TODO keypairs
								newAccountKeypair = false;
								accountKeypair = RSA.import(keypair);
								return;
							}

							if (args.accountKeypair) {
								// TODO keypairs
								accountKeypair = RSA.import(
									args.accountKeypair
								);
								return;
							}

							var keypairOpts = {
								bitlen: args.rsaKeySize,
								exp: 65537,
								public: true,
								pem: true
							};
							// TODO keypairs
							return (args.generateKeypair ||
								RSA.generateKeypairAsync)(keypairOpts).then(
								function(keypair) {
									keypair.privateKeyPem = RSA.exportPrivatePem(
										keypair
									);
									keypair.publicKeyPem = RSA.exportPublicPem(
										keypair
									);
									keypair.privateKeyJwk = RSA.exportPrivateJwk(
										keypair
									);
									accountKeypair = keypair;
								}
							);
						})
						.then(function() {
							return accountKeypair;
						});

					return promise.then(function(keypair) {
						// Note: the ACME urls are always fetched fresh on purpose
						// TODO acme-v2/nocompat
						return core.getAcmeUrlsAsync(args).then(function(urls) {
							args._acmeUrls = urls;

							// TODO acme-v2/nocompat
							return gl.acme
								.registerNewAccountAsync({
									email: args.email,
									newRegUrl: args._acmeUrls.newReg,
									newAuthzUrl: args._acmeUrls.newAuthz,
									agreeToTerms: function(tosUrl, agreeCb) {
										if (
											true === args.agreeTos ||
											tosUrl === args.agreeTos ||
											tosUrl === gl.agreeToTerms
										) {
											agreeCb(null, tosUrl);
											return;
										}

										// args.email = email;      // already there
										// args.domains = domains   // already there
										args.tosUrl = tosUrl;
										gl.agreeToTerms(args, agreeCb);
									},
									accountKeypair: keypair,

									debug: gl.debug || args.debug
								})
								.then(function(receipt) {
									var reg = {
										keypair: keypair,
										receipt: receipt,
										kid:
											receipt &&
											receipt.key &&
											(receipt.key.kid || receipt.kid),
										email: args.email,
										newRegUrl: args._acmeUrls.newReg,
										newAuthzUrl: args._acmeUrls.newAuthz
									};

									var accountKeypairPromise;
									args.keypair = keypair;
									args.receipt = receipt;
									if (newAccountKeypair) {
										accountKeypairPromise = gl.store.accounts.setKeypairAsync(
											args,
											keypair
										);
									}
									return Promise.resolve(
										accountKeypairPromise
									).then(function() {
										// TODO move templating of arguments to right here?
										if (!gl.store.accounts.setAsync) {
											return Promise.resolve({
												keypair: keypair
											});
										}
										return gl.store.accounts
											.setAsync(args, reg)
											.then(function(account) {
												if (
													account &&
													'object' !== typeof account
												) {
													throw new Error(
														"store.accounts.setAsync should either return 'null' or an object with at least a string 'id'"
													);
												}
												if (!account) {
													account = {};
												}
												account.keypair = keypair;
												return account;
											});
									});
								});
						});
					});
				});
			},

			// Accounts
			// (only used for keypair)
			getAsync: function(args) {
				var accountPromise = null;
				if (gl.store.accounts.checkAsync) {
					accountPromise = core.accounts.checkAsync(args);
				}
				return Promise.resolve(accountPromise).then(function(account) {
					if (!account) {
						return core.accounts.registerAsync(args);
					}
					if (account.keypair) {
						return account;
					}

					if (!args.account) {
						args.account = {};
					}
					if ('object' === typeof args.account && !args.account.id) {
						args.account.id = args.accountId || args.email || '';
					}
					var copy = utils.merge(args, gl);
					args = utils.tplCopy(copy);
					return gl.store.accounts
						.checkKeypairAsync(args)
						.then(function(keypair) {
							if (keypair) {
								return { keypair: keypair };
							}
							return core.accounts.registerAsync(args);
						});
				});
			},

			// Accounts
			checkAsync: function(args) {
				var requiredArgs = ['accountId', 'email', 'domains', 'domain'];
				if (
					!(args.account && (args.account.id || args.account.kid)) &&
					!requiredArgs.some(function(key) {
						return -1 !== Object.keys(args).indexOf(key);
					})
				) {
					return Promise.reject(
						new Error(
							"In order to register or retrieve an account one of '" +
								requiredArgs.join("', '") +
								"' must be present"
						)
					);
				}

				var copy = utils.merge(args, gl);
				args = utils.tplCopy(copy);
				if (!args.account) {
					args.account = {};
				}
				if ('object' === typeof args.account && !args.account.id) {
					args.account.id = args.accountId || args.email || '';
				}

				// we can re-register the same account until we're blue in the face and it's all the same
				// of course, we can also skip the lookup if we do store the account, but whatever
				if (!gl.store.accounts.checkAsync) {
					return Promise.resolve(null);
				}
				return gl.store.accounts
					.checkAsync(args)
					.then(function(account) {
						if (!account) {
							return null;
						}

						args.account = account;
						args.accountId = account.id;

						return account;
					});
			}
		},

		certificates: {
			// Certificates
			registerAsync: function(args) {
				var err;
				var challengeDefaults =
					gl[
						'_challengeOpts_' +
							(args.challengeType || gl.challengeType)
					] || {};
				var copy = utils.merge(args, challengeDefaults || {});
				copy = utils.merge(copy, gl);
				if (!copy.subject) {
					copy.subject = copy.domains[0];
				}
				if (!copy.domain) {
					copy.domain = copy.domains[0];
				}
				args = utils.tplCopy(copy);

				if (!Array.isArray(args.domains)) {
					return Promise.reject(
						new Error('args.domains should be an array of domains')
					);
				}
				//if (-1 === args.domains.indexOf(args.subject)) // TODO relax the constraint once acme-v2 handles subject?
				if (args.subject !== args.domains[0]) {
					console.warn(
						"The certificate's subject (primary domain) should be first in the list of opts.domains"
					);
					console.warn(
						'\topts.subject: (set by you approveDomains(), falling back to opts.domain) ' +
							args.subject
					);
					console.warn(
						'\topts.domain: (set by SNICallback()) ' + args.domain
					);
					console.warn(
						'\topts.domains: (set by you in approveDomains()) ' +
							args.domains.join(',')
					);
					console.warn(
						'Updating your code will prevent weird, random, hard-to-repro bugs during renewals'
					);
					console.warn(
						'(also this will be required in the next major version of greenlock)'
					);
					//return Promise.reject(new Error('certificate subject (primary domain) must be the first in opts.domains'));
				}
				if (
					!(
						args.domains.length &&
						args.domains.every(utils.isValidDomain)
					)
				) {
					// NOTE: this library can't assume to handle the http loopback
					// (or dns-01 validation may be used)
					// so we do not check dns records or attempt a loopback here
					err = new Error(
						"invalid domain name(s): '(" +
							args.subject +
							') ' +
							args.domains.join(',') +
							"'"
					);
					err.code = 'INVALID_DOMAIN';
					return Promise.reject(err);
				}

				// If a previous request to (re)register a certificate is already underway we need
				// to return the same promise created before rather than registering things twice.
				// I'm not 100% sure how to properly handle the case where someone registers domain
				// lists with some but not all elements common, nor am I sure that's even a case that
				// is allowed to happen anyway. But for now we act like the list is completely the
				// same if any elements are the same.
				var promise;
				args.domains.some(function(name) {
					if (pendingRegistrations.hasOwnProperty(name)) {
						promise = pendingRegistrations[name];
						return true;
					}
				});
				if (promise) {
					return promise;
				}

				promise = core.certificates._runRegistration(args);

				// Now that the registration is actually underway we need to make sure any subsequent
				// registration attempts return the same promise until it is completed (but not after
				// it is completed).
				args.domains.forEach(function(name) {
					pendingRegistrations[name] = promise;
				});
				function clearPending() {
					args.domains.forEach(function(name) {
						delete pendingRegistrations[name];
					});
				}
				promise.then(clearPending, clearPending);

				return promise;
			},
			_runRegistration: function(args) {
				// TODO renewal cb
				// accountId and or email
				return core.accounts.getAsync(args).then(function(account) {
					args.account = account;

					if (
						args.certificate &&
						args.certificate.privkey &&
						(args.certificate.privkey.jwk ||
							args.certificate.privkey.pem)
					) {
						// TODO import jwk or pem and return it here
						console.warn(
							'TODO: implement certificates.checkKeypairAsync skipping'
						);
					}
					var domainKeypair;
					var newDomainKeypair = true;
					// This has been done in the getAsync already, so we skip it here
					// if approveDomains doesn't set subject, we set it here
					//args.subject = args.subject || args.domains[0];
					var promise = gl.store.certificates
						.checkKeypairAsync(args)
						.then(function(keypair) {
							if (keypair) {
								domainKeypair = RSA.import(keypair);
								newDomainKeypair = false;
								return;
							}

							if (args.domainKeypair) {
								domainKeypair = RSA.import(args.domainKeypair);
								return;
							}

							var keypairOpts = {
								bitlen: args.rsaKeySize,
								exp: 65537,
								public: true,
								pem: true
							};
							return (args.generateKeypair ||
								RSA.generateKeypairAsync)(keypairOpts).then(
								function(keypair) {
									keypair.privateKeyPem = RSA.exportPrivatePem(
										keypair
									);
									keypair.publicKeyPem = RSA.exportPublicPem(
										keypair
									);
									keypair.privateKeyJwk = RSA.exportPrivateJwk(
										keypair
									);
									domainKeypair = keypair;
								}
							);
						})
						.then(function() {
							return domainKeypair;
						});

					return promise
						.then(function(domainKeypair) {
							args.domainKeypair = domainKeypair;
							//args.registration = domainKey;

							// Note: the ACME urls are always fetched fresh on purpose
							// TODO is this the right place for this?
							return core
								.getAcmeUrlsAsync(args)
								.then(function(urls) {
									args._acmeUrls = urls;

									var certReq = {
										debug: args.debug || gl.debug,

										newAuthzUrl: args._acmeUrls.newAuthz,
										newCertUrl: args._acmeUrls.newCert,

										accountKeypair: RSA.import(
											account.keypair
										),
										domainKeypair: domainKeypair,
										subject: args.subject, // TODO handle this in acme-v2
										domains: args.domains,
										challengeTypes: Object.keys(
											args.challenges
										)
									};

									//
									// IMPORTANT
									//
									// setChallenge and removeChallenge are handed defaults
									// instead of args because getChallenge does not have
									// access to args
									// (args is per-request, defaults is per instance)
									//
									// Each of these fires individually for each domain,
									// even though the certificate on the whole may have many domains
									//
									certReq.setChallenge = function(
										challenge,
										done
									) {
										log(
											args.debug,
											"setChallenge called for '" +
												challenge.altname +
												"'"
										);
										// NOTE: First arg takes precedence
										var copy = utils.merge(
											{ domains: [challenge.altname] },
											args
										);
										copy = utils.merge(copy, gl);
										utils.tplCopy(copy);
										copy.challenge = challenge;

										if (
											1 ===
											copy.challenges[challenge.type].set
												.length
										) {
											copy.challenges[challenge.type]
												.set(copy)
												.then(function(result) {
													done(null, result);
												})
												.catch(done);
										} else if (
											2 ===
											copy.challenges[challenge.type].set
												.length
										) {
											copy.challenges[challenge.type].set(
												copy,
												done
											);
										} else {
											Object.keys(challenge).forEach(
												function(key) {
													done[key] = challenge[key];
												}
											);
											// regression bugfix for le-challenge-cloudflare
											// (_acme-challege => _greenlock-dryrun-XXXX)
											copy.acmePrefix =
												(
													challenge.dnsHost || ''
												).replace(/\.*/, '') ||
												copy.acmePrefix;
											copy.challenges[challenge.type].set(
												copy,
												challenge.altname,
												challenge.token,
												challenge.keyAuthorization,
												done
											);
										}
									};
									certReq.removeChallenge = function(
										challenge,
										done
									) {
										log(
											args.debug,
											"removeChallenge called for '" +
												challenge.altname +
												"'"
										);
										var copy = utils.merge(
											{ domains: [challenge.altname] },
											args
										);
										copy = utils.merge(copy, gl);
										utils.tplCopy(copy);
										copy.challenge = challenge;

										if (
											1 ===
											copy.challenges[challenge.type]
												.remove.length
										) {
											copy.challenges[challenge.type]
												.remove(copy)
												.then(function(result) {
													done(null, result);
												})
												.catch(done);
										} else if (
											2 ===
											copy.challenges[challenge.type]
												.remove.length
										) {
											copy.challenges[
												challenge.type
											].remove(copy, done);
										} else {
											Object.keys(challenge).forEach(
												function(key) {
													done[key] = challenge[key];
												}
											);
											copy.challenges[
												challenge.type
											].remove(
												copy,
												challenge.altname,
												challenge.token,
												done
											);
										}
									};
									certReq.init = function(deps) {
										var copy = utils.merge(deps, args);
										copy = utils.merge(copy, gl);
										utils.tplCopy(copy);

										Object.keys(copy.challenges).forEach(
											function(key) {
												if (
													'function' ===
													typeof copy.challenges[key]
														.init
												) {
													copy.challenges[key].init(
														copy
													);
												}
											}
										);

										return null;
									};
									certReq.getZones = function(challenge) {
										var copy = utils.merge(
											{
												dnsHosts: args.domains.map(
													function(x) {
														return 'xxxx.' + x;
													}
												)
											},
											args
										);
										copy = utils.merge(copy, gl);
										utils.tplCopy(copy);
										copy.challenge = challenge;

										if (
											!copy.challenges[challenge.type] ||
											'function' !==
												typeof copy.challenges[
													challenge.type
												].zones
										) {
											// may not be available, that's fine.
											return Promise.resolve([]);
										}

										return copy.challenges[
											challenge.type
										].zones(copy);
									};

									log(
										args.debug,
										'calling greenlock.acme.getCertificateAsync',
										certReq.subject,
										certReq.domains
									);

									// TODO acme-v2/nocompat
									return gl.acme
										.getCertificateAsync(certReq)
										.then(utils.attachCertInfo);
								});
						})
						.then(function(results) {
							//var requested = {};
							//var issued = {};
							// { cert, chain, privkey /*TODO, subject, altnames, issuedAt, expiresAt */ }

							// args.certs.privkey = RSA.exportPrivatePem(options.domainKeypair);
							args.certs = results;
							// args.pems is deprecated
							args.pems = results;
							// This has been done in the getAsync already, so we skip it here
							// if approveDomains doesn't set subject, we set it here
							//args.subject = args.subject || args.domains[0];
							var promise;
							if (newDomainKeypair) {
								args.keypair = domainKeypair;
								promise = gl.store.certificates.setKeypairAsync(
									args,
									domainKeypair
								);
							}
							return Promise.resolve(promise).then(function() {
								return gl.store.certificates
									.setAsync(args)
									.then(function() {
										return results;
									});
							});
						});
				});
			},
			// Certificates
			renewAsync: function(args, certs) {
				var renewableAt = core.certificates._getRenewableAt(
					args,
					certs
				);
				var err;
				//var halfLife = (certs.expiresAt - certs.issuedAt) / 2;
				//var renewable = (Date.now() - certs.issuedAt) > halfLife;

				log(
					args.debug,
					'(Renew) Expires At',
					new Date(certs.expiresAt).toISOString()
				);
				log(
					args.debug,
					'(Renew) Renewable At',
					new Date(renewableAt).toISOString()
				);

				if (!args.duplicate && Date.now() < renewableAt) {
					err = new Error(
						"[ERROR] Certificate issued at '" +
							new Date(certs.issuedAt).toISOString() +
							"' and expires at '" +
							new Date(certs.expiresAt).toISOString() +
							"'. Ignoring renewal attempt until '" +
							new Date(renewableAt).toISOString() +
							"'. Set { duplicate: true } to force."
					);
					err.code = 'E_NOT_RENEWABLE';
					return Promise.reject(err);
				}

				// Either the cert has entered its renewal period
				// or we're forcing a refresh via 'dupliate: true'
				log(args.debug, 'Renewing!');

				if (!args.domains || !args.domains.length) {
					args.domains =
						args.servernames ||
						[certs.subject].concat(certs.altnames);
				}

				return core.certificates.registerAsync(args);
			},
			// Certificates
			_isRenewable: function(args, certs) {
				var renewableAt = core.certificates._getRenewableAt(
					args,
					certs
				);

				log(
					args.debug,
					'Check Expires At',
					new Date(certs.expiresAt).toISOString()
				);
				log(
					args.debug,
					'Check Renewable At',
					new Date(renewableAt).toISOString()
				);

				if (args.duplicate || Date.now() >= renewableAt) {
					log(args.debug, 'certificates are renewable');
					return true;
				}

				return false;
			},
			_getRenewableAt: function(args, certs) {
				return certs.expiresAt - (args.renewWithin || gl.renewWithin);
			},
			checkAsync: function(args) {
				var copy = utils.merge(args, gl);
				// if approveDomains doesn't set subject, we set it here
				if (!(copy.domains && copy.domains.length)) {
					copy.domains = [copy.subject || copy.domain].filter(
						Boolean
					);
				}
				if (!copy.subject) {
					copy.subject = copy.domains[0];
				}
				if (!copy.domain) {
					copy.domain = copy.domains[0];
				}
				args = utils.tplCopy(copy);

				// returns pems
				return gl.store.certificates
					.checkAsync(args)
					.then(function(cert) {
						if (!cert) {
							log(
								args.debug,
								'checkAsync failed to find certificates'
							);
							return null;
						}

						cert = utils.attachCertInfo(cert);
						if (utils.certHasDomain(cert, args.domain)) {
							log(
								args.debug,
								'checkAsync found existing certificates'
							);

							if (cert.privkey) {
								return cert;
							} else {
								return gl.store.certificates
									.checkKeypairAsync(args)
									.then(function(keypair) {
										cert.privkey =
											keypair.privateKeyPem ||
											RSA.exportPrivatePem(keypair);
										return cert;
									});
							}
						}
						log(
							args.debug,
							'checkAsync found mismatched / incomplete certificates'
						);
					});
			},
			// Certificates
			getAsync: function(args) {
				var copy = utils.merge(args, gl);
				// if approveDomains doesn't set subject, we set it here
				if (!(copy.domains && copy.domains.length)) {
					copy.domains = [copy.subject || copy.domain].filter(
						Boolean
					);
				}
				if (!copy.subject) {
					copy.subject = copy.domains[0];
				}
				if (!copy.domain) {
					copy.domain = copy.domains[0];
				}
				args = utils.tplCopy(copy);

				if (
					args.certificate &&
					args.certificate.privkey &&
					args.certificate.cert &&
					args.certificate.chain
				) {
					// TODO skip fetching a certificate if it's fetched during approveDomains
					console.warn(
						'TODO: implement certificates.checkAsync skipping'
					);
				}
				return core.certificates
					.checkAsync(args)
					.then(function(certs) {
						if (certs) {
							certs = utils.attachCertInfo(certs);
						}
						if (
							!certs ||
							!utils.certHasDomain(certs, args.domain)
						) {
							// There is no cert available
							if (
								false !== args.securityUpdates &&
								!args._communityMemberAdded
							) {
								// We will notify all greenlock users of mandatory and security updates
								// We'll keep track of versions and os so we can make sure things work well
								// { name, version, email, domains, action, communityMember, telemetry }
								require('./community').add({
									name: args._communityPackage,
									version: args._communityPackageVersion,
									email: args.email,
									domains: args.domains || args.servernames,
									action: 'reg',
									communityMember: args.communityMember,
									telemetry: args.telemetry
								});
								args._communityMemberAdded = true;
							}
							return core.certificates.registerAsync(args);
						}

						if (core.certificates._isRenewable(args, certs)) {
							// it's time to renew the available cert
							if (
								false !== args.securityUpdates &&
								!args._communityMemberAdded
							) {
								// We will notify all greenlock users of mandatory and security updates
								// We'll keep track of versions and os so we can make sure things work well
								// { name, version, email, domains, action, communityMember, telemetry }
								require('./community').add({
									name: args._communityPackage,
									version: args._communityPackageVersion,
									email: args.email,
									domains: args.domains || args.servernames,
									action: 'renew',
									communityMember: args.communityMember,
									telemetry: args.telemetry
								});
								args._communityMemberAdded = true;
							}
							certs.renewing = core.certificates.renewAsync(
								args,
								certs
							);
							if (args.waitForRenewal) {
								return certs.renewing;
							}
						}

						// return existing unexpired (although potentially stale) certificates when available
						// there will be an additional .renewing property if the certs are being asynchronously renewed
						return certs;
					})
					.then(function(results) {
						// returns pems
						return results;
					});
			}
		}
	};

	return core;
};
