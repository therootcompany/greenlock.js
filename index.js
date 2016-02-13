'use strict';

// TODO handle www and no-www together somehow?

var PromiseA = require('bluebird');
var leCore = require('letiny-core');
var merge = require('./lib/common').merge;
var tplCopy = require('./lib/common').tplCopy;

var LE = module.exports;
LE.productionServerUrl = leCore.productionServerUrl;
LE.stagingServerUrl = leCore.stagingServerUrl;
LE.configDir = leCore.configDir;
LE.logsDir = leCore.logsDir;
LE.workDir = leCore.workDir;
LE.acmeChallengPrefix = leCore.acmeChallengPrefix;
LE.knownEndpoints = leCore.knownEndpoints;

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
  var d, b, h;
  // backwards compat for <= v1.0.2
  if (defaults.registerAsync || defaults.create) {
    b = defaults; d = handlers; h = backend;
    defaults = d; handlers = h; backend = b;
  }
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
  , validate: function (hostnames, cb) {
      // TODO check dns, etc
      if ((!hostnames.length && hostnames.every(le.isValidDomain))) {
        cb(new Error("node-letsencrypt: invalid hostnames: " + hostnames.join(',')));
        return;
      }

      //
      // IMPORTANT
      //
      // Before attempting a dynamic registration you need to validate that
      //
      //   * these are hostnames that you expected to exist on the system
      //   * their A records currently point to this ip
      //   * this system's ip hasn't changed
      //
      //  If you do not check these things, then someone could attack you
      //  and cause you, in return, to have your ip be rate-limit blocked
      //
      //console.warn("\n[TODO]: node-letsencrypt: `validate(hostnames, cb)` needs to be implemented");
      //console.warn("(it'll work fine without it, but for security - and convenience - it should be implemented\n");
      // UPDATE:
      // it's actually probably better that we don't do this here and instead
      // take care of it in the approveRegistrationCallback in letsencrypt-express
      cb(null, true);
    }
  , _registerHelper: function (args, cb) {
      var copy = LE.merge(defaults, args);
      var err;

      if (!utils.isValidDomain(args.domains[0])) {
        err = new Error("invalid domain");
        err.code = "INVALID_DOMAIN";
        cb(err);
        return;
      }

      le.validate(args.domains, function (err) {
        if (err) {
          cb(err);
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
      });
    }
  , _fetchHelper: function (args, cb) {
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
  , fetch: function (args, cb) {
      if (defaults.debug || args.debug) {
        console.log('[LE] fetch');
      }
      le._fetchHelper(args, cb);
    }
  , renew: function (args, cb) {
      if (defaults.debug || args.debug) {
        console.log('[LE] renew');
      }
      args.duplicate = false;
      le.register(args, cb);
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
  , register: function (args, cb) {
      if (defaults.debug || args.debug) {
        console.log('[LE] register');
      }
      if (!Array.isArray(args.domains)) {
        cb(new Error('args.domains should be an array of domains'));
        return;
      }
      // this may be run in a cluster environment
      // in that case it should NOT check the cache
      // but ensure that it has the most fresh copy
      // before attempting a renew
      le._fetchHelper(args, function (err, hit) {
        var now = Date.now();

        if (err) {
          // had a bad day
          cb(err);
          return;
        }
        else if (hit) {
          if (!args.duplicate && (now - hit.issuedAt) < ((hit.lifetime || handlers.lifetime) * 0.65)) {
            console.warn("\ntried to renew a certificate with over 1/3 of its lifetime left, ignoring");
            console.warn("(use --duplicate or opts.duplicate to override\n");
            cb(null, hit);
            return;
          }
        }

        le._registerHelper(args, function (err/*, pems*/) {
          if (err) {
            cb(err);
            return;
          }

          // Sanity Check
          le._fetchHelper(args, function (err, pems) {
            if (pems) {
              cb(null, pems);
              return;
            }

            // still couldn't read the certs after success... that's weird
            console.error("still couldn't read certs after success... that's weird");
            cb(err, null);
          });
        });
      });
    }
  };

  return le;
};
