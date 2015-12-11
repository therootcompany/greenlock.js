'use strict';

module.exports.create = function (lebinpath, defaults, options) {
  var PromiseA = require('bluebird');
  var tls = require('tls');
  var fs = PromiseA.promisifyAll(require('fs'));
  var letsencrypt = PromiseA.promisifyAll(require('./le-exec-wrapper'));

  //var attempts = {};  // should exist in master process only
  var ipc = {};       // in-process cache
  var count = 0;

  //var certTpl = "/live/:hostname/cert.pem";
  var certTpl = "/live/:hostname/fullchain.pem";
  var privTpl = "/live/:hostname/privkey.pem";

  options.cacheContextsFor = options.cacheContextsFor || (1 * 60 * 60 * 1000);

  defaults.webroot = true;
  defaults.webrootPath = '/srv/www/acme-challenge';

  return letsencrypt.optsAsync(lebinpath).then(function (keys) {
    var now;
    var le;

    le = {
      validate: function () {
      }
    , argnames: keys
    , readCerts: function (hostname) {
        var crtpath = defaults.configDir + certTpl.replace(/:hostname/, hostname);
        var privpath = defaults.configDir + privTpl.replace(/:hostname/, hostname);

        return PromiseA.all([
          fs.readFileAsync(privpath, 'ascii')
        , fs.readFileAsync(crtpath, 'ascii')
          // stat the file, not the link
        , fs.statAsync(crtpath, 'ascii')
        ]).then(function (arr) {


          return arr;
        });
      }
    , cacheCerts: function (hostname, certs) {
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
    , readAndCacheCerts: function (hostname) {
        return le.readCerts(hostname).then(function (certs) {
          return le.cacheCerts(hostname, certs);
        });
      }
    , get: function (hostname, args, opts, cb) {
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

        return le.readCerts(hostname).then(function (cached) {
          cb(null, cached.context);
        }, function (/*err*/) {
          var copy = {};
          var arr;

          // TODO validate domains and such
          Object.keys(defaults).forEach(function (key) {
            copy[key] = defaults[key];
          });
          Object.keys(args).forEach(function (key) {
            copy[key] = args[key];
          });

          arr = letsencrypt.objToArr(keys, copy);
          // TODO validate domains empirically before trying le
          return letsencrypt.execAsync(lebinpath, arr, opts).then(function () {
            // wait at least n minutes
            return le.readCerts(hostname).then(function (cached) {
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
  });
};
