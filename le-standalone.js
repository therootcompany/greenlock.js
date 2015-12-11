'use strict';

var letsencrypt = require('letsencrypt');
var networkInterfaces = require('os').networkInterfaces();
var ipify = require('ipify');

function getSecureContext(le, hostname, cb) {
  hostname = hostname.replace(/^www\./, '');

  function needsRegistration(hostnames, cb) {
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
    le.validate(hostnames, {
      networkInterfaces: networkInterfaces
    , ipify: ipify
    }, function (err) {
      if (err) {
        cb(null, null);
        return;
      }

      // these hostnames need to be registered
      //
      cb(null, {
        email: 'john.doe@gmail.com'
      , agreeTos: true
      , domains: ['www.' + hostname, hostname]
      });
    });
  }

  // secure contexts will be cached
  // renewals will be checked in the background

  le.get(hostname, needsRegistration, function (secureContext) {
    // this will fallback to the localCerts if the domain cannot be registered
    if (!secureContext) {
      var localCerts = require('localhost.daplie.com-certificates');
      secureContext = localCerts;
    }
    cb(null, secureContext);
  }, function (err) {
    cb(err);
  });
}

letsencrypt.create(
  '/home/user/.local/share/letsencrypt/bin/letsencrypt'
  // set some defaults
, { configDir: '/etc/letsencrypt'
  , workDir: '/var/lib/letsencrypt'
  , logsDir: '/var/log/letsencrypt'
  , standalone: true
  //, webroot: true
  //, webrootPath: '/srv/www/acme-challenges/'
  }
, { cacheContextsFor: 1 * 60 * 60 * 1000 // 1 hour
  , cacheRenewChecksFor: 3 * 24 * 60 * 60 * 1000 // 3 days
  }
).then(function (le) {
  getSecureContext(le, 'example.com', function (secureContext) {
    console.log(secureContext);
  });
});
