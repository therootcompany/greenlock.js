'use strict';

module.exports.create = function (le) {
  var PromiseA = require('bluebird');
  var utils = require('./utils'); // merge, tplCopy;
  var RSA = PromiseA.promisifyAll(require('rsa-compat').RSA);
  var LeCore = PromiseA.promisifyAll(require('letiny-core'));
  var crypto = require('crypto');

  function attachCertInfo(results) {
    var getCertInfo = require('./cert-info').getCertInfo;
    // XXX Note: Parsing the certificate info comes at a great cost (~500kb)
    var certInfo = getCertInfo(results.cert);

    //results.issuedAt = arr[3].mtime.valueOf()
    results.issuedAt = Date(certInfo.notBefore.value).valueOf(); // Date.now()
    results.expiresAt = Date(certInfo.notAfter.value).valueOf();

    return results;
  }

  function createAccount(args, handlers) {
    return RSA.generateKeypairAsync(args.rsaKeySize, 65537, { public: true, pem: true }).then(function (keypair) {

      return LeCore.registerNewAccountAsync({
        email: args.email
      , newRegUrl: args._acmeUrls.newReg
      , agreeToTerms: function (tosUrl, agree) {
          // args.email = email; // already there
          args.tosUrl = tosUrl;
          handlers.agreeToTerms(args, agree);
        }
      , accountKeypair: keypair

      , debug: defaults.debug || args.debug || handlers.debug
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

        return backend.setAccountAsync(args, account).then(function () {
          return account;
        });
      });
    });
  }

  function getAcmeUrls(args) {
    var now = Date.now();

    // TODO check response header on request for cache time
    if ((now - le._ipc.acmeUrlsUpdatedAt) < 10 * 60 * 1000) {
      return PromiseA.resolve(le._ipc.acmeUrls);
    }

    return LeCore.getAcmeUrlsAsync(args.server).then(function (data) {
      le._ipc.acmeUrlsUpdatedAt = Date.now();
      le._ipc.acmeUrls = data;

      return le._ipc.acmeUrls;
    });
  }

  function getCertificateAsync(args, defaults, handlers) {

    function log() {
      if (args.debug || defaults.debug) {
        console.log.apply(console, arguments);
      }
    }

    var account = args.account;
    var promise;
    var keypairOpts = { public: true, pem: true };

    promise = backend.getPrivatePem(args).then(function (pem) {
      return RSA.import({ privateKeyPem: pem });
    }, function (/*err*/) {
      return RSA.generateKeypairAsync(args.rsaKeySize, 65537, keypairOpts).then(function (keypair) {
        keypair.privateKeyPem = RSA.exportPrivatePem(keypair);
        keypair.privateKeyJwk = RSA.exportPrivateJwk(keypair);
        return backend.setPrivatePem(args, keypair);
      });
    });

    return promise.then(function (domainKeypair) {
      log("[le/core.js] get certificate");

      args.domainKeypair = domainKeypair;
      //args.registration = domainKey;

      return LeCore.getCertificateAsync({
        debug: args.debug

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
          var copy = handlers.merge({ domains: [domain] }, defaults, backendDefaults);
          handlers.tplCopy(copy);

          //args.domains = [domain];
          args.domains = args.domains || [domain];

          if (5 !== handlers.setChallenge.length) {
            done(new Error("handlers.setChallenge receives the wrong number of arguments."
              + " You must define setChallenge as function (opts, domain, key, val, cb) { }"));
            return;
          }

          handlers.setChallenge(copy, domain, key, value, done);
        }
      , removeChallenge: function (domain, key, done) {
          var copy = handlers.merge({ domains: [domain] }, defaults, backendDefaults);
          handlers.tplCopy(copy);

          if (4 !== handlers.removeChallenge.length) {
            done(new Error("handlers.removeChallenge receives the wrong number of arguments."
              + " You must define removeChallenge as function (opts, domain, key, cb) { }"));
            return;
          }

          handlers.removeChallenge(copy, domain, key, done);
        }
      }).then(attachCertInfo);
    }).then(function (results) {
      // { cert, chain, fullchain, privkey }

      args.pems = results;
      return backend.setRegistration(args, defaults, handlers);
    });
  }

  function getOrCreateDomainCertificate(args, defaults, handlers) {
    if (args.duplicate) {
      // we're forcing a refresh via 'dupliate: true'
      return getCertificateAsync(args, defaults, handlers);
    }

    return wrapped.fetchAsync(args).then(function (certs) {
      var halfLife = (certs.expiresAt - certs.issuedAt) / 2;

      if (!certs || (Date.now() - certs.issuedAt) > halfLife) {
        // There is no cert available
        // Or the cert is more than half-expired
        return getCertificateAsync(args, defaults, handlers);
      }

      return PromiseA.reject(new Error(
          "[ERROR] Certificate issued at '"
        + new Date(certs.issuedAt).toISOString() + "' and expires at '"
        + new Date(certs.expiresAt).toISOString() + "'. Ignoring renewal attempt until half-life at '"
        + new Date(certs.issuedA + halfLife).toISOString() + "'. Set { duplicate: true } to force."
      ));
    });
  }

  // returns 'account' from lib/accounts { meta, regr, keypair, accountId (id) }
  function getOrCreateAcmeAccount(args, defaults, handlers) {
    function log() {
      if (args.debug) {
        console.log.apply(console, arguments);
      }
    }

    return backend.getAccountId(args).then(function (accountId) {

      // Note: the ACME urls are always fetched fresh on purpose
      return getAcmeUrls(args).then(function (urls) {
        args._acmeUrls = urls;

        if (accountId) {
          log('[le/core.js] use account');

          args.accountId = accountId;
          return backend.getAccount(args, handlers);
        } else {
          log('[le/core.js] create account');
          return createAccount(args, handlers);
        }
      });
    });
  }

  var wrapped = {
    registerAsync: function (args) {
      var err;

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

      var copy = handlers.merge(args, defaults, backendDefaults);
      handlers.tplCopy(copy);

      return getOrCreateAcmeAccount(copy, defaults, handlers).then(function (account) {
        copy.account = account;

        return backend.getOrCreateRenewal(copy).then(function (pyobj) {

          copy.pyobj = pyobj;
          return getOrCreateDomainCertificate(copy, defaults, handlers);
        });
      }).then(function (result) {
        return result;
      }, function (err) {
        return PromiseA.reject(err);
      });
    }
  , getOrCreateAccount: function (args) {
      return createAccount(args, handlers);
    }
  , configureAsync: function (hargs) {
      var copy = handlers.merge(hargs, defaults, backendDefaults);
      handlers.tplCopy(copy);

      return getOrCreateAcmeAccount(copy, defaults, handlers).then(function (account) {
        copy.account = account;
        return backend.getOrCreateRenewal(copy);
      });
    }
  , fetchAsync: function (args) {
      var copy = handlers.merge(args, defaults);
      handlers.tplCopy(copy);

      return backend.fetchAsync(copy).then(attachCertInfo);
    }
  };

  return wrapped;
};
