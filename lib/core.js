'use strict';

var PromiseA;
try {
  PromiseA = require('bluebird');
} catch(e) {
  PromiseA = global.Promise;
}
var util = require('util');
function promisifyAll(obj) {
  var aobj = {};
  Object.keys(obj).forEach(function (key) {
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
    args.unshift("[greenlock/lib/core.js]");
    console.log.apply(console, args);
  }
}

module.exports.create = function (gl) {
  var utils = require('./utils');
  var RSA = promisifyAll(require('rsa-compat').RSA);
  var log = gl.log || _log; // allow custom log
  var pendingRegistrations = {};

  var core = {
    //
    // Helpers
    //
    getAcmeUrlsAsync: function (args) {
      var now = Date.now();

      // TODO check response header on request for cache time
      if ((now - gl._ipc.acmeUrlsUpdatedAt) < 10 * 60 * 1000) {
        return PromiseA.resolve(gl._ipc.acmeUrls);
      }

      return gl.acme.getAcmeUrlsAsync(args.server).then(function (data) {
        gl._ipc.acmeUrlsUpdatedAt = Date.now();
        gl._ipc.acmeUrls = data;

        return gl._ipc.acmeUrls;
      });
    }


    //
    // The Main Enchilada
    //

    //
    // Accounts
    //
  , accounts: {
      // Accounts
      registerAsync: function (args) {
        var err;
        var copy = utils.merge(args, gl);
        var disagreeTos;
        args = utils.tplCopy(copy);

        disagreeTos = (!args.agreeTos && 'undefined' !== typeof args.agreeTos);
        if (!args.email || disagreeTos || (parseInt(args.rsaKeySize, 10) < 2048)) {
          err = new Error(
            "In order to register an account both 'email' and 'agreeTos' must be present"
              + " and 'rsaKeySize' must be 2048 or greater."
          );
          err.code = 'E_ARGS';
          return PromiseA.reject(err);
        }

        return utils.testEmail(args.email).then(function () {
          var promise = gl.store.accounts.checkKeypairAsync(args).then(function (keypair) {
            if (keypair) {
              return RSA.import(keypair);
            }

            if (args.accountKeypair) {
              return gl.store.accounts.setKeypairAsync(args, RSA.import(args.accountKeypair));
            }

            var keypairOpts = { bitlen: args.rsaKeySize, exp: 65537, public: true, pem: true };
            return RSA.generateKeypairAsync(keypairOpts).then(function (keypair) {
              keypair.privateKeyPem = RSA.exportPrivatePem(keypair);
              keypair.publicKeyPem = RSA.exportPublicPem(keypair);
              keypair.privateKeyJwk = RSA.exportPrivateJwk(keypair);
              return gl.store.accounts.setKeypairAsync(args, keypair);
            });
          });

          return promise.then(function (keypair) {
            // Note: the ACME urls are always fetched fresh on purpose
            // TODO is this the right place for this?
            return core.getAcmeUrlsAsync(args).then(function (urls) {
              args._acmeUrls = urls;

              return gl.acme.registerNewAccountAsync({
                email: args.email
              , newRegUrl: args._acmeUrls.newReg
              , newAuthzUrl: args._acmeUrls.newAuthz
              , agreeToTerms: function (tosUrl, agreeCb) {
                  if (true === args.agreeTos || tosUrl === args.agreeTos || tosUrl === gl.agreeToTerms) {
                    agreeCb(null, tosUrl);
                    return;
                  }

                  // args.email = email;      // already there
                  // args.domains = domains   // already there
                  args.tosUrl = tosUrl;
                  gl.agreeToTerms(args, agreeCb);
                }
              , accountKeypair: keypair

              , debug: gl.debug || args.debug
              }).then(function (receipt) {
                var reg = {
                  keypair: keypair
                , receipt: receipt
                , email: args.email
                , newRegUrl: args._acmeUrls.newReg
                , newAuthzUrl: args._acmeUrls.newAuthz
                };

                // TODO move templating of arguments to right here?
                return gl.store.accounts.setAsync(args, reg).then(function (account) {
                  // should now have account.id and account.accountId
                  args.account = account;
                  args.accountId = account.id;
                  return account;
                });
              });
            });
          });
        });
      }

      // Accounts
    , getAsync: function (args) {
        return core.accounts.checkAsync(args).then(function (account) {
          if (account) {
            return account;
          } else {
            return core.accounts.registerAsync(args);
          }
        });
      }

      // Accounts
    , checkAsync: function (args) {
        var requiredArgs = ['accountId', 'email', 'domains', 'domain'];
        if (!requiredArgs.some(function (key) { return -1 !== Object.keys(args).indexOf(key); })) {
          return PromiseA.reject(new Error(
            "In order to register or retrieve an account one of '" + requiredArgs.join("', '") + "' must be present"
          ));
        }

        var copy = utils.merge(args, gl);
        args = utils.tplCopy(copy);

        return gl.store.accounts.checkAsync(args).then(function (account) {

          if (!account) {
            return null;
          }

          args.account = account;
          args.accountId = account.id;

          return account;
        });
      }
    }

  , certificates: {
      // Certificates
      registerAsync: function (args) {
        var err;
        var challengeDefaults = gl['_challengeOpts_' + (args.challengeType || gl.challengeType)] || {};
        var copy = utils.merge(args, challengeDefaults || {});
        copy = utils.merge(copy, gl);
        args = utils.tplCopy(copy);

        if (!Array.isArray(args.domains)) {
          return PromiseA.reject(new Error('args.domains should be an array of domains'));
        }

        if (!(args.domains.length && args.domains.every(utils.isValidDomain))) {
          // NOTE: this library can't assume to handle the http loopback
          // (or dns-01 validation may be used)
          // so we do not check dns records or attempt a loopback here
          err = new Error("invalid domain name(s): '" + args.domains + "'");
          err.code = "INVALID_DOMAIN";
          return PromiseA.reject(err);
        }

        // If a previous request to (re)register a certificate is already underway we need
        // to return the same promise created before rather than registering things twice.
        // I'm not 100% sure how to properly handle the case where someone registers domain
        // lists with some but not all elements common, nor am I sure that's even a case that
        // is allowed to happen anyway. But for now we act like the list is completely the
        // same if any elements are the same.
        var promise;
        args.domains.some(function (name) {
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
        args.domains.forEach(function (name) {
          pendingRegistrations[name] = promise;
        });
        function clearPending() {
          args.domains.forEach(function (name) {
            delete pendingRegistrations[name];
          });
        }
        promise.then(clearPending, clearPending);

        return promise;
      }
    , _runRegistration: function (args) {
        // TODO renewal cb
        // accountId and or email
        return core.accounts.getAsync(args).then(function (account) {
          args.account = account;

          var promise = gl.store.certificates.checkKeypairAsync(args).then(function (keypair) {
            if (keypair) {
              return RSA.import(keypair);
            }

            if (args.domainKeypair) {
              return gl.store.certificates.setKeypairAsync(args, RSA.import(args.domainKeypair));
            }

            var keypairOpts = { bitlen: args.rsaKeySize, exp: 65537, public: true, pem: true };
            return RSA.generateKeypairAsync(keypairOpts).then(function (keypair) {
              keypair.privateKeyPem = RSA.exportPrivatePem(keypair);
              keypair.publicKeyPem = RSA.exportPublicPem(keypair);
              keypair.privateKeyJwk = RSA.exportPrivateJwk(keypair);
              return gl.store.certificates.setKeypairAsync(args, keypair);
            });
          });

          return promise.then(function (domainKeypair) {
            args.domainKeypair = domainKeypair;
            //args.registration = domainKey;

            // Note: the ACME urls are always fetched fresh on purpose
            // TODO is this the right place for this?
            return core.getAcmeUrlsAsync(args).then(function (urls) {
              args._acmeUrls = urls;

              var certReq = {
                debug: args.debug || gl.debug

              , newAuthzUrl: args._acmeUrls.newAuthz
              , newCertUrl: args._acmeUrls.newCert

              , accountKeypair: RSA.import(account.keypair)
              , domainKeypair: domainKeypair
              , domains: args.domains
              , challengeType: args.challengeType
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
              certReq.setChallenge = function (domain, key, value, done) {
                log(args.debug, "setChallenge called for '" + domain + "'");
                var copy = utils.merge({ domains: [domain] }, args);
                copy = utils.merge(copy, gl);
                utils.tplCopy(copy);

                // TODO need to save challengeType
                gl.challenges[args.challengeType].set(copy, domain, key, value, done);
              };
              certReq.removeChallenge = function (domain, key, done) {
                log(args.debug, "removeChallenge called for '" + domain + "'");
                var copy = utils.merge({ domains: [domain] }, gl);
                utils.tplCopy(copy);

                gl.challenges[args.challengeType].remove(copy, domain, key, done);
              };

              log(args.debug, 'calling greenlock.acme.getCertificateAsync', certReq.domains);

              return gl.acme.getCertificateAsync(certReq).then(utils.attachCertInfo);
            });
          }).then(function (results) {
            // { cert, chain, privkey /*TODO, subject, altnames, issuedAt, expiresAt */ }

            // args.certs.privkey = RSA.exportPrivatePem(options.domainKeypair);
            args.certs = results;
            // args.pems is deprecated
            args.pems = results;
            return gl.store.certificates.setAsync(args).then(function () {
              return results;
            });
          });
        });
      }
      // Certificates
    , renewAsync: function (args, certs) {
        var renewableAt = core.certificates._getRenewableAt(args, certs);
        var err;
        //var halfLife = (certs.expiresAt - certs.issuedAt) / 2;
        //var renewable = (Date.now() - certs.issuedAt) > halfLife;

        log(args.debug, "(Renew) Expires At", new Date(certs.expiresAt).toISOString());
        log(args.debug, "(Renew) Renewable At", new Date(renewableAt).toISOString());

        if (!args.duplicate && Date.now() < renewableAt) {
          err = new Error(
              "[ERROR] Certificate issued at '"
            + new Date(certs.issuedAt).toISOString() + "' and expires at '"
            + new Date(certs.expiresAt).toISOString() + "'. Ignoring renewal attempt until '"
            + new Date(renewableAt).toISOString() + "'. Set { duplicate: true } to force."
          );
          err.code = 'E_NOT_RENEWABLE';
          return PromiseA.reject(err);
        }

        // Either the cert has entered its renewal period
        // or we're forcing a refresh via 'dupliate: true'
        log(args.debug, "Renewing!");

        if (!args.domains || !args.domains.length) {
          args.domains = args.servernames || [certs.subject].concat(certs.altnames);
        }

        return core.certificates.registerAsync(args);
      }
      // Certificates
    , _isRenewable: function (args, certs) {
        var renewableAt = core.certificates._getRenewableAt(args, certs);

        log(args.debug, "Check Expires At", new Date(certs.expiresAt).toISOString());
        log(args.debug, "Check Renewable At", new Date(renewableAt).toISOString());

        if (args.duplicate || Date.now() >= renewableAt) {
          log(args.debug, "certificates are renewable");
          return true;
        }

        return false;
      }
    , _getRenewableAt: function (args, certs) {
        return certs.expiresAt - (args.renewWithin || gl.renewWithin);
      }
    , checkAsync: function (args) {
        var copy = utils.merge(args, gl);
        utils.tplCopy(copy);

        // returns pems
        return gl.store.certificates.checkAsync(copy).then(function (cert) {
          if (cert) {
            log(args.debug, 'checkAsync found existing certificates');
            return utils.attachCertInfo(cert);
          }

          log(args.debug, 'checkAsync failed to find certificates');
          return null;
        });
      }
      // Certificates
    , getAsync: function (args) {
        var copy = utils.merge(args, gl);
        args = utils.tplCopy(copy);

        return core.certificates.checkAsync(args).then(function (certs) {
          if (!certs) {
            // There is no cert available
            if (false !== args.securityUpdates && !args._communityMemberAdded) {
              try {
                // We will notify all greenlock users of mandatory and security updates
                // We'll keep track of versions and os so we can make sure things work well
                // { name, version, email, domains, action, communityMember, telemetry }
                require('./community').add({
                  name: args._communityPackage
                , version: args._communityPackageVersion
                , email: args.email
                , domains: args.domains || args.servernames
                , action: 'reg'
                , communityMember: args.communityMember
                , telemetry: args.telemetry
                });
              } catch(e) { /* ignore */ }
              args._communityMemberAdded = true;
            }
            return core.certificates.registerAsync(args);
          }

          if (core.certificates._isRenewable(args, certs)) {
            // it's time to renew the available cert
            if (false !== args.securityUpdates && !args._communityMemberAdded) {
              try {
                // We will notify all greenlock users of mandatory and security updates
                // We'll keep track of versions and os so we can make sure things work well
                // { name, version, email, domains, action, communityMember, telemetry }
                require('./community').add({
                  name: args._communityPackage
                , version: args._communityPackageVersion
                , email: args.email
                , domains: args.domains || args.servernames
                , action: 'renew'
                , communityMember: args.communityMember
                , telemetry: args.telemetry
                });
              } catch(e) { /* ignore */ }
              args._communityMemberAdded = true;
            }
            certs.renewing = core.certificates.renewAsync(args, certs);
            if (args.waitForRenewal) {
              return certs.renewing;
            }
          }

          // return existing unexpired (although potentially stale) certificates when available
          // there will be an additional .renewing property if the certs are being asynchronously renewed
          return certs;
        }).then(function (results) {
          // returns pems
          return results;
        });
      }
    }

  };

  return core;
};
