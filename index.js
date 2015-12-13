'use strict';

var PromiseA = require('bluebird');
var tls = require('tls');

var LE = module.exports;

LE.cacheCertInfo = function (args, certInfo, ipc, handlers) {
  // Randomize by +(0% to 25%) to prevent all caches expiring at once
  var rnd = (require('crypto').randomBytes(1)[0] / 255);
  var memorizeFor = Math.floor(handlers.memorizeFor + ((handlers.memorizeFor / 4) * rnd));
  var hostname = args.domains[0];

  certInfo.context = tls.createSecureContext({
    key: certInfo.key
  , cert: certInfo.cert
  //, ciphers // node's defaults are great
  });
  certInfo.duration = certInfo.duration || handlers.duration;
  certInfo.loadedAt = Date.now();
  certInfo.memorizeFor = memorizeFor;

  ipc[hostname] = certInfo;
  return ipc[hostname];
};

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

LE.create = function (letsencrypt, defaults, handlers) {
  if (!handlers) { handlers = {}; }
  if (!handlers.duration) { handlers.duration = 90 * 24 * 60 * 60 * 1000; }
  if (!handlers.renewIn) { handlers.renewIn = 80 * 24 * 60 * 60 * 1000; }
  if (!handlers.memorizeFor) { handlers.memorizeFor = 1 * 24 * 60 * 60 * 1000; }
  letsencrypt = PromiseA.promisifyAll(letsencrypt);
  var fs = PromiseA.promisifyAll(require('fs'));
  var utils = require('./utils');

  // TODO move to backend-python.js
  var registerAsync = PromiseA.promisify(function (args) {
    return letsencrypt.registerAsync('certonly', args);
  });
  var fetchAsync = PromiseA.promisify(function (args) {
    var hostname = args.domains[0];
    var crtpath = defaults.configDir + defaults.fullchainTpl.replace(/:hostname/, hostname);
    var privpath = defaults.configDir + defaults.privkeyTpl.replace(/:hostname/, hostname);

    return PromiseA.all([
      fs.readFileAsync(privpath, 'ascii')
    , fs.readFileAsync(crtpath, 'ascii')
      // stat the file, not the link
    , fs.statAsync(crtpath, 'ascii')
    ]).then(function (arr) {
      return {
        key: arr[0]  // privkey.pem
      , cert: arr[1] // fullchain.pem
        // TODO parse centificate
      , renewedAt: arr[2].mtime.valueOf()
      };
    });
  });
  defaults.webroot = true;

  //var attempts = {};  // should exist in master process only
  var ipc = {};       // in-process cache
  var le;

  // TODO check certs on initial load
  // TODO expect that certs expire every 90 days
  // TODO check certs with setInterval?
  //options.cacheContextsFor = options.cacheContextsFor || (1 * 60 * 60 * 1000);

  function isCurrent(cache) {
    return cache;
  }

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

      if (isCurrent(cache)) {
        vazhdo();
        return;
      }

      var args = LE.merge(defaults, { domains: [hostname] });
      handlers.sniRegisterCallback(args, cache, vazhdo);
    });
  }

  le = {
    validate: function (hostnames, cb) {
      // TODO check dns, etc
      if ((!hostnames.length && hostnames.every(le.isValidDomain))) {
        cb(new Error("node-letsencrypt: invalid hostnames: " + hostnames.join(',')));
        return;
      }

      console.warn("[SECURITY WARNING]: node-letsencrypt: validate(hostnames, cb) NOT IMPLEMENTED");
      cb(null, true);
    }
  , middleware: function () {
      //console.log('[DEBUG] webrootPath', defaults.webrootPath);
      var serveStatic = require('serve-static')(defaults.webrootPath, { dotfiles: 'allow' });
      var prefix = '/.well-known/acme-challenge/';

      return function (req, res, next) {
        if (0 !== req.url.indexOf(prefix)) {
          next();
          return;
        }

        serveStatic(req, res, next);
      };
    }
  , SNICallback: sniCallback
  , sniCallback: sniCallback
  , register: function (args, cb) {
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

        return registerAsync(copy).then(function () {
          // calls fetch because fetch calls cacheCertInfo
          return le.fetch(args, cb);
        }, cb);
      });
    }
  , fetch: function (args, cb) {
      var hostname = args.domains[0];
      // TODO don't call now() every time because this is hot code
      var now = Date.now();

      // TODO handle www and no-www together somehow?
      var cached = ipc[hostname];

      if (cached) {
        cb(null, cached.context);

        if ((now - cached.loadedAt) < (cached.memorizeFor)) {
          // not stale yet
          return;
        }
      }

      return fetchAsync(args).then(function (certInfo) {
        if (certInfo) {
          certInfo = LE.cacheCertInfo(args, certInfo, ipc, handlers);
          cb(null, certInfo.context);
        } else {
          cb(null, null);
        }
      }, cb);
    }
  , fetchOrRegister: function (args, cb) {
      le.fetch(args, function (err, hit) {
        var hostname = args.domains[0];

        if (err) {
          cb(err);
          return;
        }
        else if (hit) {
          cb(null, hit);
          return;
        }

        // TODO validate domains empirically before trying le
        return registerAsync(args/*, opts*/).then(function () {
          // wait at least n minutes
          le.fetch(args, function (err, cache) {
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

          // wasn't successful with lets encrypt, don't try again for n minutes
          ipc[hostname] = {
            context: null
          , renewedAt: Date.now()
          , duration: (5 * 60 * 1000)
          };

          cb(null, ipc[hostname]);
        });
      });
    }
  };

  return le;
};
