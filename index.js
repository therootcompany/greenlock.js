'use strict';

// TODO handle www and no-www together somehow?

var PromiseA = require('bluebird');
var crypto = require('crypto');
var tls = require('tls');
var path = require('path');

var LE = module.exports;

LE.liveServer = "https://acme-v01.api.letsencrypt.org/directory";
LE.stagingServer = "https://acme-staging.api.letsencrypt.org/directory";
LE.configDir = "/etc/letsencrypt/";
LE.logsDir = "/var/log/letsencrypt/";
LE.workDir = "/var/lib/letsencrypt/";

LE.merge = function merge(defaults, args) {
  var copy = {};

  Object.keys(defaults).forEach(function (key) {
    copy[key] = defaults[key];
  });
  Object.keys(args).forEach(function (key) {
    copy[key] = args[key];
  });

  return copy;
};

LE.create = function (backend, defaults, handlers) {
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
    if (!defaults.webrootPath) {
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
      defaultos.domains = [hostname];
      require('./lib/default-handlers').getChallenge(defaultos, key, done);
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
  backend = PromiseA.promisifyAll(backend);

  var utils = require('./utils');
  //var attempts = {};  // should exist in master process only
  var ipc = {};       // in-process cache
  var le;

  // TODO check certs on initial load
  // TODO expect that certs expire every 90 days
  // TODO check certs with setInterval?
  //options.cacheContextsFor = options.cacheContextsFor || (1 * 60 * 60 * 1000);

  function sniCallback(hostname, cb) {
    var args = LE.merge(defaults, {});
    args.domains = [hostname];

    le.fetch(args, function (err, cache) {
      if (err) {
        cb(err);
        return;
      }

      // vazhdo is Albanian for 'continue'
      function vazhdo(err, c2) {
        if (err) {
          cb(err);
          return;
        }

        cache = c2 || cache;

        if (!cache.context) {
          cache.context = tls.createSecureContext({
            key: cache.key    // privkey.pem
          , cert: cache.cert  // fullchain.pem
          //, ciphers         // node's defaults are great
          });
        }

        cb(null, cache.context);
      }

      if (cache) {
        vazhdo();
        return;
      }

      var args = LE.merge(defaults, { domains: [hostname] });
      handlers.sniRegisterCallback(args, cache, vazhdo);
    });
  }

  le = {
    backend: backend
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
      console.warn("[SECURITY WARNING]: node-letsencrypt: validate(hostnames, cb) NOT IMPLEMENTED");
      cb(null, true);
    }
  , middleware: function () {
      var prefix = '/.well-known/acme-challenge/';

      return function (req, res, next) {
        if (0 !== req.url.indexOf(prefix)) {
          console.log('[LE middleware]: pass');
          next();
          return;
        }

        //args.domains = [req.hostname];
        console.log('[LE middleware]:', req.hostname, req.url, req.url.slice(prefix.length));
        handlers.getChallenge(req.hostname, req.url.slice(prefix.length), function (err, token) {
          if (err) {
            res.send("Error: These aren't the tokens you're looking for. Move along.");
            return;
          }

          res.send(token);
        });
      };
    }
  , SNICallback: sniCallback
  , sniCallback: sniCallback
  , _registerHelper: function (args, cb) {
      var copy = LE.merge(defaults, args);
      var err;

      if (!utils.isValidDomain(args.domains[0])) {
        err = new Error("invalid domain");
        err.code = "INVALID_DOMAIN";
        cb(err);
        return;
      }

      return le.validate(args.domains, function (err) {
        if (err) {
          cb(err);
          return;
        }

        console.log("[NLE]: begin registration");
        return backend.registerAsync(copy).then(function () {
          console.log("[NLE]: end registration");
          // calls fetch because fetch calls cacheCertInfo
          return le.fetch(args, cb);
        }, cb);
      });
    }
  , _fetchHelper: function (args, cb) {
      return backend.fetchAsync(args).then(function (certInfo) {
        if (!certInfo) {
          cb(null, null);
          return;
        }

        var now = Date.now();

        // key, cert, issuedAt, lifetime, expiresAt
        if (!certInfo.expiresAt) {
          certInfo.expiresAt = certInfo.issuedAt + (certInfo.lifetime || handlers.lifetime);
        }
        if (!certInfo.lifetime) {
          certInfo.lifetime = (certInfo.lifetime || handlers.lifetime);
        }

        // a pretty good hard buffer
        certInfo.expiresAt -= (1 * 24 * 60 * 60 * 100);
        certInfo = LE.cacheCertInfo(args, certInfo, ipc, handlers);
        if (now > certInfo.bestIfUsedBy && !certInfo.timeout) {
          // EXPIRING
          if (now  > certInfo.expiresAt) {
            // EXPIRED
            certInfo.renewTimeout = Math.floor(certInfo.renewTimeout / 2);
          }

          certInfo.timeout = setTimeout(function () {
            le.register(args, cb);
          }, certInfo.renewTimeout);
        }
        cb(null, certInfo.context);
      }, cb);
    }
  , fetch: function (args, cb) {
      var hostname = args.domains[0];
      // TODO don't call now() every time because this is hot code
      var now = Date.now();
      var certInfo = ipc[hostname];

      // TODO once ECDSA is available, wait for cert renewal if its due
      if (certInfo) {
        if (now > certInfo.bestIfUsedBy && !certInfo.timeout) {
          // EXPIRING
          if (now  > certInfo.expiresAt) {
            // EXPIRED
            certInfo.renewTimeout = Math.floor(certInfo.renewTimeout / 2);
          }

          certInfo.timeout = setTimeout(function () {
            le.register(args, cb);
          }, certInfo.renewTimeout);
        }
        cb(null, certInfo.context);

        if ((now - certInfo.loadedAt) < (certInfo.memorizeFor)) {
          // these aren't stale, so don't fall through
          return;
        }
      }

      le._fetchHelper(args, cb);
    }
  , register: function (args, cb) {
      // this may be run in a cluster environment
      // in that case it should NOT check the cache
      // but ensure that it has the most fresh copy
      // before attempting a renew
      le._fetchHelper(args, function (err, hit) {
        var hostname = args.domains[0];

        if (err) {
          cb(err);
          return;
        }
        else if (hit) {
          cb(null, hit);
          return;
        }

        return le._registerHelper(args, function (err) {
          if (err) {
            cb(err);
            return;
          }

          le._fetchHelper(args, function (err, cache) {
            if (cache) {
              cb(null, cache.context);
              return;
            }

            // still couldn't read the certs after success... that's weird
            cb(err, null);
          });
        }, function (err) {
          console.error("[Error] Let's Encrypt failed:");
          console.error(err.stack || new Error(err.message || err.toString()).stack);

          // wasn't successful with lets encrypt, don't automatically try again for 12 hours
          // TODO what's the better way to handle this?
          // failure callback?
          ipc[hostname] = {
            context: null // TODO default context
          , issuedAt: Date.now()
          , lifetime: (12 * 60 * 60 * 1000)
          // , expiresAt: generated in next step
          };

          cb(err, ipc[hostname]);
        });
      });
    }
  };

  return le;
};

LE.cacheCertInfo = function (args, certInfo, ipc, handlers) {
  // TODO IPC via process and worker to guarantee no races
  // rather than just "really good odds"

  var hostname = args.domains[0];
  var now = Date.now();

  // Stagger randomly by plus 0% to 25% to prevent all caches expiring at once
  var rnd1 = (crypto.randomBytes(1)[0] / 255);
  var memorizeFor = Math.floor(handlers.memorizeFor + ((handlers.memorizeFor / 4) * rnd1));
  // Stagger randomly to renew between n and 2n days before renewal is due
  // this *greatly* reduces the risk of multiple cluster processes renewing the same domain at once
  var rnd2 = (crypto.randomBytes(1)[0] / 255);
  var bestIfUsedBy = certInfo.expiresAt - (handlers.renewWithin + Math.floor(handlers.renewWithin * rnd2));
  // Stagger randomly by plus 0 to 5 min to reduce risk of multiple cluster processes
  // renewing at once on boot when the certs have expired
  var rnd3 = (crypto.randomBytes(1)[0] / 255);
  var renewTimeout = Math.floor((5 * 60 * 1000) * rnd3);

  certInfo.context = tls.createSecureContext({
    key: certInfo.key
  , cert: certInfo.cert
  //, ciphers // node's defaults are great
  });
  certInfo.loadedAt = now;
  certInfo.memorizeFor = memorizeFor;
  certInfo.bestIfUsedBy = bestIfUsedBy;
  certInfo.renewTimeout = renewTimeout;

  ipc[hostname] = certInfo;
  return ipc[hostname];
};
