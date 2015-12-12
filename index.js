'use strict';

var PromiseA = require('bluebird');

module.exports.create = function (letsencrypt, defaults, options) {
  letsencrypt = PromiseA.promisifyAll(letsencrypt);
  var tls = require('tls');
  var fs = PromiseA.promisifyAll(require('fs'));
  var utils = require('./utils');
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
    ]);
  });

  //var attempts = {};  // should exist in master process only
  var ipc = {};       // in-process cache
  var count = 0;

  var now;
  var le;

  // TODO check certs on initial load
  // TODO expect that certs expire every 90 days
  // TODO check certs with setInterval?
  //options.cacheContextsFor = options.cacheContextsFor || (1 * 60 * 60 * 1000);

  defaults.webroot = true;

  function merge(args) {
    var copy = {};

    Object.keys(defaults).forEach(function (key) {
      copy[key] = defaults[key];
    });
    Object.keys(args).forEach(function (key) {
      copy[key] = args[key];
    });

    return copy;
  }

  function isCurrent(cache) {
    return cache;
  }

  function sniCallback(hostname, cb) {
    var args = merge({});
    args.domains = [hostname];
    le.fetch(args, function (err, cache) {
      if (err) {
        cb(err);
        return;
      }

      function respond(c2) {
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
        respond();
        return;
      }

      defaults.needsRegistration(hostname, respond);
    });
  }

  le = {
    validate: function () {
      // TODO check dns, etc
      return PromiseA.resolve();
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
  , cacheCerts: function (args, certs) {
      var hostname = args.domains[0];
      // assume 90 day renewals based on stat time, for now
      ipc[hostname] = {
        context: tls.createSecureContext({
          key: certs[0]  // privkey.pem
        , cert: certs[1] // fullchain.pem
        //, ciphers // node's defaults are great
        })
      , updated: Date.now()
      };

      return ipc[hostname];
    }
  , readAndCacheCerts: function (args) {
      return fetchAsync(args).then(function (certs) {
        return le.cacheCerts(args, certs);
      });
    }
  , register: function (args) {
      // TODO validate domains and such

      var copy = merge(args);

      if (!utils.isValidDomain(args.domains[0])) {
        return PromiseA.reject({
          message: "invalid domain"
        , code: "INVALID_DOMAIN"
        });
      }

      return le.validate(args.domains).then(function () {
        return registerAsync(copy).then(function () {
          return fetchAsync(args);
        });
      });
    }
  , fetch: function (args, cb) {
      var hostname = args.domains[0];

      count += 1;

      if (count >= 1000) {
        now = Date.now();
        count = 0;
      }

      var cached = ipc[hostname];
      // TODO handle www and no-www together
      if (cached && ((now - cached.updated) < options.cacheContextsFor)) {
        cb(null, cached.context);
        return;
      }

      return fetchAsync(args).then(function (cached) {
        cb(null, cached.context);
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
          return fetchAsync(args).then(function (cached) {
            // success
            cb(null, cached.context);
          }, function (err) {
            // still couldn't read the certs after success... that's weird
            cb(err);
          });
        }, function (err) {
          console.error("[Error] Let's Encrypt failed:");
          console.error(err.stack || new Error(err.message || err.toString()));

          // wasn't successful with lets encrypt, don't try again for n minutes
          ipc[hostname] = {
            context: null
          , updated: Date.now()
          };
          cb(null, ipc[hostname]);
        });
      });
    }
  };

  return le;
};
