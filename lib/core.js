'use strict';

module.exports.create = function (le) {
  var PromiseA = require('bluebird');
  var utils = require('./utils'); // merge, tplCopy;
  var RSA = PromiseA.promisifyAll(require('rsa-compat').RSA);
  var crypto = require('crypto');

  var core = {
    //
    // Helpers
    //
    getAcmeUrlsAsync: function (args) {
      var now = Date.now();

      // TODO check response header on request for cache time
      if ((now - le._ipc.acmeUrlsUpdatedAt) < 10 * 60 * 1000) {
        return PromiseA.resolve(le._ipc.acmeUrls);
      }

      return le.acme.getAcmeUrlsAsync(args.server).then(function (data) {
        le._ipc.acmeUrlsUpdatedAt = Date.now();
        le._ipc.acmeUrls = data;

        return le._ipc.acmeUrls;
      });
    }


    //
    // The Main Enchilada
    //

    //
    // Accounts
    //
  , accounts: {
      registerAsync: function (args) {
        return RSA.generateKeypairAsync(args.rsaKeySize, 65537, { public: true, pem: true }).then(function (keypair) {

          return le.acme.registerNewAccountAsync({
            email: args.email
          , newRegUrl: args._acmeUrls.newReg
          , agreeToTerms: function (tosUrl, agreeCb) {
              if (true === args.agreeTos || tosUrl === args.agreeTos || tosUrl === le.agreeToTerms) {
                agreeCb(null, tosUrl);
                return;
              }

              // args.email = email;      // already there
              // args.domains = domains   // already there
              args.tosUrl = tosUrl;
              le.agreeToTerms(args, agreeCb);
            }
          , accountKeypair: keypair

          , debug: le.debug || args.debug
          }).then(function (body) {
            // TODO XXX use sha256 (the python client uses md5)
            // TODO ssh fingerprint (noted on rsa-compat issues page, I believe)
            keypair.publicKeyMd5 = crypto.createHash('md5').update(RSA.exportPublicPem(keypair)).digest('hex');
            keypair.publicKeySha256 = crypto.createHash('sha256').update(RSA.exportPublicPem(keypair)).digest('hex');

            var accountId = keypair.publicKeyMd5;
            var regr = { body: body };
            var account = {};

            args.accountId = accountId;

            account.keypair = keypair;
            account.regr = regr;
            account.accountId = accountId;
            account.id = accountId;

            args.account = account;

            return le.store.accounts.setAsync(args, account).then(function () {
              return account;
            });
          });
        });
      }
      // getOrCreateAcmeAccount
    , getAsync: function (args) {
        return core.accounts.checkAsync(args).then(function (account) {
            if (account) {
              return le.store.accounts.checkAccount(args);
            } else {
              return core.accounts.registerAsync(args);
            }
        });
      }
    , checkAsync: function (args) {
        return le.store.accounts.checkAccountId(args).then(function (accountId) {

          if (!accountId) {
            return null;
          }

          args.accountId = accountId;

          // Note: the ACME urls are always fetched fresh on purpose
          return core.getAcmeUrlsAsync(args).then(function (urls) {
            args._acmeUrls = urls;


            // return le.store.accounts.checkAccountId(args).then(function (accountId) {
            return le.store.accounts.checkAsync(args);
          });
        });
      }
    }

  , certificates: {
      registerAsync: function (args) {
        var err;
        var copy = utils.merge(args, le);
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

        return core.accounts.getAsync(copy).then(function (account) {
          copy.account = account;

          //var account = args.account;
          var keypairOpts = { public: true, pem: true };

          var promise = le.store.certificates.checkKeypairAsync(args).then(function (keypair) {
            return RSA.import(keypair);
          }, function (/*err*/) {
            return RSA.generateKeypairAsync(args.rsaKeySize, 65537, keypairOpts).then(function (keypair) {
              keypair.privateKeyPem = RSA.exportPrivatePem(keypair);
              keypair.privateKeyJwk = RSA.exportPrivateJwk(keypair);
              return le.store.certificates.setKeypairAsync(args, keypair);
            });
          });

          return promise.then(function (domainKeypair) {
            args.domainKeypair = domainKeypair;
            //args.registration = domainKey;

            return le.acme.getCertificateAsync({
              debug: args.debug || le.debug

            , newAuthzUrl: args._acmeUrls.newAuthz
            , newCertUrl: args._acmeUrls.newCert

            , accountKeypair: RSA.import(account.keypair)
            , domainKeypair: domainKeypair
            , domains: args.domains
            , challengeType: args.challengeType

              //
              // IMPORTANT
              //
              // setChallenge and removeChallenge are handed defaults
              // instead of args because getChallenge does not have
              // access to args
              // (args is per-request, defaults is per instance)
              //
            , setChallenge: function (domain, key, value, done) {
                var copy = utils.merge({ domains: [domain] }, le);
                utils.tplCopy(copy);

                //args.domains = [domain];
                args.domains = args.domains || [domain];

                if (5 !== le.challenger.set.length) {
                  done(new Error("le.challenger.set receives the wrong number of arguments."
                    + " You must define setChallenge as function (opts, domain, key, val, cb) { }"));
                  return;
                }

                le.challenger.set(copy, domain, key, value, done);
              }
            , removeChallenge: function (domain, key, done) {
                var copy = utils.merge({ domains: [domain] }, le);
                utils.tplCopy(copy);

                if (4 !== le.challenger.remove.length) {
                  done(new Error("le.challenger.remove receives the wrong number of arguments."
                    + " You must define removeChallenge as function (opts, domain, key, cb) { }"));
                  return;
                }

                le.challenger.remove(copy, domain, key, done);
              }
            }).then(utils.attachCertInfo);
          }).then(function (results) {
            // { cert, chain, fullchain, privkey }

            args.pems = results;
            return le.store.certificates.setAsync(args).then(function () {
              return results;
            });
          });
        });
      }
    , checkAsync: function (args) {
        var copy = utils.merge(args, le);
        utils.tplCopy(copy);

        // returns pems
        return le.store.certificates.checkAsync(copy).then(utils.attachCertInfo);
      }
    , getAsync: function (args) {
        var copy = utils.merge(args, le);
        args = utils.tplCopy(copy);

        if (args.duplicate) {
          // we're forcing a refresh via 'dupliate: true'
          return core.certificates.registerAsync(args);
        }

        return core.certificates.checkAsync(args).then(function (certs) {
          var renewableAt = certs.expiresAt - le.renewWithin;
          //var halfLife = (certs.expiresAt - certs.issuedAt) / 2;
          //var renewable = (Date.now() - certs.issuedAt) > halfLife;

          if (!certs || Date.now() >= renewableAt) {
            // There is no cert available
            // Or the cert is more than half-expired
            return core.certificates.registerAsync(args);
          }

          return PromiseA.reject(new Error(
              "[ERROR] Certificate issued at '"
            + new Date(certs.issuedAt).toISOString() + "' and expires at '"
            + new Date(certs.expiresAt).toISOString() + "'. Ignoring renewal attempt until half-life at '"
            + new Date(renewableAt).toISOString() + "'. Set { duplicate: true } to force."
          ));
        }).then(function (results) {
          // returns pems
          return results;
        });
      }
    }

  };

  return core;
};
