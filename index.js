'use strict';

// TODO handle www and no-www together somehow?

var PromiseA = require('bluebird');
var leCore = require('letiny-core');
var merge = require('./lib/common').merge;
var tplCopy = require('./lib/common').tplCopy;
var isValidDomain = require('./lib/common').isValidDomain;

var LE = module.exports;
LE.productionServerUrl = leCore.productionServerUrl;
LE.stagingServerUrl = leCore.stagingServerUrl;
LE.configDir = leCore.configDir;
LE.logsDir = leCore.logsDir;
LE.workDir = leCore.workDir;
LE.acmeChallengPrefix = leCore.acmeChallengPrefix;
LE.knownEndpoints = leCore.knownEndpoints;
LE.isValidDomain = isValidDomain;

LE.privkeyPath = ':config/live/:hostname/privkey.pem';
LE.fullchainPath = ':config/live/:hostname/fullchain.pem';
LE.certPath = ':config/live/:hostname/cert.pem';
LE.chainPath = ':config/live/:hostname/chain.pem';
LE.renewalPath = ':config/renewal/:hostname.conf';
LE.accountsDir = ':config/accounts/:server';
LE.defaults = {
  privkeyPath: LE.privkeyPath
, fullchainPath: LE.fullchainPath
, certPath: LE.certPath
, chainPath: LE.chainPath
, renewalPath: LE.renewalPath
, accountsDir: LE.accountsDir
, server: LE.productionServerUrl
};

// backwards compat
LE.stagingServer = leCore.stagingServerUrl;
LE.liveServer = leCore.productionServerUrl;
LE.knownUrls = leCore.knownEndpoints;

LE.merge = require('./lib/common').merge;
LE.tplConfigDir = require('./lib/common').tplConfigDir;

                    // backend, defaults, handlers
LE.create = function (defaults, handlers, backend) {
  if (!backend) { backend = require('./lib/core'); }
  if (!handlers) { handlers = {}; }
  if (!handlers.lifetime) { handlers.lifetime = 90 * 24 * 60 * 60 * 1000; }
  if (!handlers.renewWithin) { handlers.renewWithin = 3 * 24 * 60 * 60 * 1000; }
  if (!handlers.memorizeFor) { handlers.memorizeFor = 1 * 24 * 60 * 60 * 1000; }
  if (!handlers.sniRegisterCallback) {
    handlers.sniRegisterCallback = function (args, cache, cb) {
      // TODO when we have ECDSA, just do this automatically
      cb(null, null);
    };
  }
  if (!handlers.getChallenge) {
    if (!defaults.manual && !defaults.webrootPath) {
      // GET /.well-known/acme-challenge/{{challengeKey}} should return {{tokenValue}}
      throw new Error("handlers.getChallenge or defaults.webrootPath must be set");
    }
    handlers.getChallenge = function (hostname, key, done) {
      // TODO associate by hostname?
      // hmm... I don't think there's a direct way to associate this with
      // the request it came from... it's kinda stateless in that way
      // but realistically there only needs to be one handler and one
      // "directory" for this. It's not that big of a deal.
      var defaultos = LE.merge(defaults, {});
      var getChallenge = require('./lib/default-handlers').getChallenge;
      var copy = merge(defaults, { domains: [hostname] });

      tplCopy(copy);
      defaultos.domains = [hostname];

      if (3 === getChallenge.length) {
        getChallenge(defaultos, key, done);
      }
      else if (4 === getChallenge.length) {
        getChallenge(defaultos, hostname, key, done);
      }
      else {
        done(new Error("handlers.getChallenge [1] receives the wrong number of arguments"));
      }
    };
  }
  if (!handlers.setChallenge) {
    if (!defaults.webrootPath) {
      // GET /.well-known/acme-challenge/{{challengeKey}} should return {{tokenValue}}
      throw new Error("handlers.setChallenge or defaults.webrootPath must be set");
    }
    handlers.setChallenge = require('./lib/default-handlers').setChallenge;
  }
  if (!handlers.removeChallenge) {
    if (!defaults.webrootPath) {
      // GET /.well-known/acme-challenge/{{challengeKey}} should return {{tokenValue}}
      throw new Error("handlers.removeChallenge or defaults.webrootPath must be set");
    }
    handlers.removeChallenge = require('./lib/default-handlers').removeChallenge;
  }
  if (!handlers.agreeToTerms) {
    if (defaults.agreeTos) {
      console.warn("[WARN] Agreeing to terms by default is risky business...");
    }
    handlers.agreeToTerms = require('./lib/default-handlers').agreeToTerms;
  }
  if ('function' === typeof backend.create) {
    backend = backend.create(defaults, handlers);
  }
  else {
    // ignore
    // this backend was created the v1.0.0 way
  }

  // replaces strings of workDir, certPath, etc
  // if they have :config/etc/live or :conf/etc/archive
  // to instead have the path of the configDir
  LE.tplConfigDir(defaults.configDir, defaults);

  backend = PromiseA.promisifyAll(backend);

  var utils = require('./lib/common');
  //var attempts = {};  // should exist in master process only
  var le;

  // TODO check certs on initial load
  // TODO expect that certs expire every 90 days
  // TODO check certs with setInterval?
  //options.cacheContextsFor = options.cacheContextsFor || (1 * 60 * 60 * 1000);

  le = {
    backend: backend
  , isValidDomain: isValidDomain
  , pyToJson: function (pyobj) {
      if (!pyobj) {
        return null;
      }

      var jsobj = {};
      Object.keys(pyobj).forEach(function (key) {
        jsobj[key] = pyobj[key];
      });
      jsobj.__lines = undefined;
      jsobj.__keys = undefined;

      return jsobj;
    }
  , register: function (args, cb) {
      if (defaults.debug || args.debug) {
        console.log('[LE] register');
      }
      if (!Array.isArray(args.domains)) {
        cb(new Error('args.domains should be an array of domains'));
        return;
      }

      var copy = LE.merge(defaults, args);
      var err;

      if (!utils.isValidDomain(args.domains[0])) {
        err = new Error("invalid domain name: '" + args.domains + "'");
        err.code = "INVALID_DOMAIN";
        cb(err);
        return;
      }

      if ((!args.domains.length && args.domains.every(le.isValidDomain))) {
        // NOTE: this library can't assume to handle the http loopback
        // (or dns-01 validation may be used)
        // so we do not check dns records or attempt a loopback here
        cb(new Error("node-letsencrypt: invalid hostnames: " + args.domains.join(',')));
        return;
      }

      if (defaults.debug || args.debug) {
        console.log("[NLE]: begin registration");
      }

      return backend.registerAsync(copy).then(function (pems) {
        if (defaults.debug || args.debug) {
          console.log("[NLE]: end registration");
        }
        cb(null, pems);
        //return le.fetch(args, cb);
      }, cb);
    }
  , fetch: function (args, cb) {
      if (defaults.debug || args.debug) {
        console.log('[LE] fetch');
      }
      return backend.fetchAsync(args).then(function (certInfo) {
        if (args.debug) {
          console.log('[LE] raw fetch certs', certInfo && Object.keys(certInfo));
        }
        if (!certInfo) { cb(null, null); return; }

        // key, cert, issuedAt, lifetime, expiresAt
        if (!certInfo.expiresAt) {
          certInfo.expiresAt = certInfo.issuedAt + (certInfo.lifetime || handlers.lifetime);
        }
        if (!certInfo.lifetime) {
          certInfo.lifetime = (certInfo.lifetime || handlers.lifetime);
        }
        // a pretty good hard buffer
        certInfo.expiresAt -= (1 * 24 * 60 * 60 * 100);

        cb(null, certInfo);
      }, cb);
    }
  , getConfig: function (args, cb) {
      if (defaults.debug || args.debug) {
        console.log('[LE] getConfig');
      }
      backend.getConfigAsync(args).then(function (pyobj) {
        cb(null, le.pyToJson(pyobj));
      }, function (err) {
        console.error("[letsencrypt/index.js] getConfig");
        console.error(err.stack);
        return cb(null, []);
      });
    }
  , getConfigs: function (args, cb) {
      if (defaults.debug || args.debug) {
        console.log('[LE] getConfigs');
      }
      backend.getConfigsAsync(args).then(function (configs) {
        cb(null, configs.map(le.pyToJson));
      }, function (err) {
        if ('ENOENT' === err.code) {
          cb(null, []);
        } else {
          console.error("[letsencrypt/index.js] getConfigs");
          console.error(err.stack);
          cb(err);
        }
      });
    }
  , setConfig: function (args, cb) {
      if (defaults.debug || args.debug) {
        console.log('[LE] setConfig');
      }
      backend.configureAsync(args).then(function (pyobj) {
        cb(null, le.pyToJson(pyobj));
      });
    }
  };

  return le;
};
