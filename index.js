'use strict';

var DAY = 24 * 60 * 60 * 1000;
//var MIN = 60 * 1000;
var ACME = require('acme-v2/compat').ACME;
var pkg = require('./package.json');
var PromiseA;
try {
  PromiseA = require('bluebird');
} catch(e) {
  PromiseA = global.Promise;
}
var util = require('util');
function promisifyAllSelf(obj) {
  if (obj.__promisified) { return obj; }
  Object.keys(obj).forEach(function (key) {
    if ('function' === typeof obj[key]) {
      obj[key + 'Async'] = util.promisify(obj[key]);
    }
  });
  obj.__promisified = true;
  return obj;
}

var Greenlock = module.exports;
Greenlock.Greenlock = Greenlock;
Greenlock.LE = Greenlock;
// in-process cache, shared between all instances
var ipc = {};

function _log(debug) {
  if (debug) {
    var args = Array.prototype.slice.call(arguments);
    args.shift();
    args.unshift("[gl/index.js]");
    console.log.apply(console, args);
  }
}

Greenlock.defaults = {
  productionServerUrl: 'https://acme-v01.api.letsencrypt.org/directory'
, stagingServerUrl: 'https://acme-staging.api.letsencrypt.org/directory'

, rsaKeySize: ACME.rsaKeySize || 2048
, challengeType: ACME.challengeType || 'http-01'
, challengeTypes: ACME.challengeTypes || [ 'http-01', 'dns-01' ]

, acmeChallengePrefix: ACME.acmeChallengePrefix
};

// backwards compat
Object.keys(Greenlock.defaults).forEach(function (key) {
  Greenlock[key] = Greenlock.defaults[key];
});

// show all possible options
var u; // undefined
Greenlock._undefined = {
  acme: u
, store: u
, challenge: u
, challenges: u
, sni: u
, tlsOptions: u

, register: u
, check: u

, renewWithin: u // le-auto-sni and core
//, renewBy: u // le-auto-sni
, acmeChallengePrefix: u
, rsaKeySize: u
, challengeType: u
, server: u
, version: u
, agreeToTerms: u
, _ipc: u
, duplicate: u
, _acmeUrls: u
};
Greenlock._undefine = function (gl) {
  Object.keys(Greenlock._undefined).forEach(function (key) {
    if (!(key in gl)) {
      gl[key] = u;
    }
  });

  return gl;
};
Greenlock.create = function (gl) {
  gl.store = gl.store || require('le-store-certbot').create({
    debug: gl.debug
  , configDir: gl.configDir
  , logsDir: gl.logsDir
  , webrootPath: gl.webrootPath
  });
  gl.core = require('./lib/core');
  var log = gl.log || _log;

  if (!gl.challenges) {
    gl.challenges = {};
  }
  if (!gl.challenges['http-01']) {
    gl.challenges['http-01'] = require('le-challenge-fs').create({
      debug: gl.debug
    , webrootPath: gl.webrootPath
    });
  }
  if (!gl.challenges['dns-01']) {
    try {
      gl.challenges['dns-01'] = require('le-challenge-ddns').create({ debug: gl.debug });
    } catch(e) {
      try {
        gl.challenges['dns-01'] = require('le-challenge-dns').create({ debug: gl.debug });
      } catch(e) {
        // not yet implemented
      }
    }
  }

  gl = Greenlock._undefine(gl);
  gl.acmeChallengePrefix = Greenlock.acmeChallengePrefix;
  gl.rsaKeySize = gl.rsaKeySize || Greenlock.rsaKeySize;
  gl.challengeType = gl.challengeType || Greenlock.challengeType;
  gl._ipc = ipc;
  gl._communityPackage = gl._communityPackage || 'greenlock.js';
  if ('greenlock.js' === gl._communityPackage) {
    gl._communityPackageVersion = pkg.version;
  } else {
    gl._communityPackageVersion = gl._communityPackageVersion || ('greenlock.js-' + pkg.version);
  }
  gl.agreeToTerms = gl.agreeToTerms || function (args, agreeCb) {
    agreeCb(new Error("'agreeToTerms' was not supplied to Greenlock and 'agreeTos' was not supplied to Greenlock.register"));
  };

  if (!gl.renewWithin) { gl.renewWithin = 14 * DAY; }
  // renewBy has a default in le-sni-auto



  ///////////////////////////
  // BEGIN VERSION MADNESS //
  ///////////////////////////

  gl.version = gl.version || 'draft-11';
  gl.server = gl.server || 'https://acme-v02.api.letsencrypt.org/directory';
  if (!gl.version) {
    //console.warn("Please specify version: 'v01' (Let's Encrypt v1) or 'draft-12' (Let's Encrypt v2 / ACME draft 12)");
    console.warn("");
    console.warn("");
    console.warn("");
    console.warn("==========================================================");
    console.warn("==                greenlock.js (v2.2.0+)                ==");
    console.warn("==========================================================");
    console.warn("");
    console.warn("Please specify 'version' option:");
    console.warn("");
    console.warn("        'draft-12' for Let's Encrypt v2 and ACME draft 12");
    console.warn("        ('v02' is an alias of 'draft-12'");
    console.warn("");
    console.warn("or");
    console.warn("");
    console.warn("        'v01' for Let's Encrypt v1 (deprecated)");
    console.warn("         (also 'npm install --save le-acme-core' as this legacy dependency will soon be removed)");
    console.warn("");
    console.warn("This will be required in versions v2.3+");
    console.warn("");
    console.warn("");
  } else if ('v02' === gl.version) {
    gl.version = 'draft-11';
  } else if ('draft-12' === gl.version) {
    gl.version = 'draft-11';
  } else if ('draft-11' === gl.version) {
    // no-op
  } else if ('v01' !== gl.version) {
    throw new Error("Unrecognized version '" + gl.version + "'");
  }

  if (!gl.server) {
    throw new Error("opts.server must specify an ACME directory URL, such as 'https://acme-staging-v02.api.letsencrypt.org/directory'");
  }
  if ('staging' === gl.server || 'production' === gl.server) {
    if ('staging' === gl.server) {
      gl.server = 'https://acme-staging.api.letsencrypt.org/directory';
      gl.version = 'v01';
      gl._deprecatedServerName = 'staging';
    }
    else if ('production' === gl.server) {
      gl.server = 'https://acme-v01.api.letsencrypt.org/directory';
      gl.version = 'v01';
      gl._deprecatedServerName = 'production';
    }
    console.warn("");
    console.warn("");
    console.warn("=== WARNING ===");
    console.warn("");
    console.warn("Due to versioning issues the '" + gl._deprecatedServerName + "' option is deprecated.");
    console.warn("Please specify the full url and version.");
    console.warn("");
    console.warn("For APIs add:");
    console.warn("\t, \"version\": \"" + gl.version + "\"");
    console.warn("\t, \"server\": \"" + gl.server + "\"");
    console.warn("");
    console.warn("For the CLI add:");
    console.warn("\t--acme-url '" + gl.server + "' \\");
    console.warn("\t--acme-version '" + gl.version + "' \\");
    console.warn("");
    console.warn("");
  }

  function loadLeV01() {
    console.warn("");
    console.warn("=== WARNING ===");
    console.warn("");
    console.warn("Let's Encrypt v1 is deprecated.");
    console.warn("Please update to Let's Encrypt v2 (ACME draft 12)");
    console.warn("");
    try {
      return require('le-acme-core').ACME;
    } catch(e) {
      console.error("");
      console.error("=== Error (easy-to-fix) ===");
      console.error("");
      console.error("Hey, this isn't a big deal, but you need to manually add v1 support:");
      console.error("");
      console.error("        npm install --save le-acme-core");
      console.error("");
      console.error("Just run that real quick, restart, and everything will work great.");
      console.error("");
      console.error("");
      process.exit(e.code || 13);
    }
  }

  if (-1 !== [
      'https://acme-v02.api.letsencrypt.org/directory'
    , 'https://acme-staging-v02.api.letsencrypt.org/directory' ].indexOf(gl.server)
  ) {
    if ('draft-11' !== gl.version) {
      console.warn("Detected Let's Encrypt v02 URL. Changing version to draft-12.");
      gl.version = 'draft-11';
    }
  } else if (-1 !== [
      'https://acme-v01.api.letsencrypt.org/directory'
    , 'https://acme-staging.api.letsencrypt.org/directory' ].indexOf(gl.server)
    || 'v01' === gl.version
  ) {
    if ('v01' !== gl.version) {
      console.warn("Detected Let's Encrypt v01 URL (deprecated). Changing version to v01.");
      gl.version = 'v01';
    }
  }
  if ('v01' === gl.version) {
    ACME = loadLeV01();
  }
  /////////////////////////
  // END VERSION MADNESS //
  /////////////////////////



  gl.acme = gl.acme || ACME.create({ debug: gl.debug });
  if (gl.acme.create) {
    gl.acme = gl.acme.create(gl);
  }
  gl.acme = promisifyAllSelf(gl.acme);
  gl._acmeOpts = gl.acme.getOptions();
  Object.keys(gl._acmeOpts).forEach(function (key) {
    if (!(key in gl)) {
      gl[key] = gl._acmeOpts[key];
    }
  });

  if (gl.store.create) {
    gl.store = gl.store.create(gl);
  }
  gl.store = promisifyAllSelf(gl.store);
  gl.store.accounts = promisifyAllSelf(gl.store.accounts);
  gl.store.certificates = promisifyAllSelf(gl.store.certificates);
  gl._storeOpts = gl.store.getOptions();
  Object.keys(gl._storeOpts).forEach(function (key) {
    if (!(key in gl)) {
      gl[key] = gl._storeOpts[key];
    }
  });


  //
  // Backwards compat for <= v2.1.7
  //
  if (gl.challenge) {
    console.warn("Deprecated use of gl.challenge. Use gl.challenges['" + Greenlock.challengeType + "'] instead.");
    gl.challenges[gl.challengeType] = gl.challenge;
  }

  Greenlock.challengeTypes.forEach(function (challengeType) {
    var challenger = gl.challenges[challengeType];

    if (!challenger) {
      return;
    }

    if (challenger.create) {
      challenger = gl.challenges[challengeType] = challenger.create(gl);
    }
    if (!challenger.getOptionsAsync) {
      challenger = gl.challenges[challengeType] = promisifyAllSelf(challenger);
    }
    gl['_challengeOpts_' + challengeType] = challenger.getOptions();
    Object.keys(gl['_challengeOpts_' + challengeType]).forEach(function (key) {
      if (!(key in gl)) {
        gl[key] = gl['_challengeOpts_' + challengeType][key];
      }
    });

    // TODO wrap these here and now with tplCopy?
    if (!challenger.set || 5 !== challenger.set.length) {
      throw new Error("gl.challenges[" + challengeType + "].set receives the wrong number of arguments."
        + " You must define setChallenge as function (opts, domain, token, keyAuthorization, cb) { }");
    }
    if (challenger.get && 4 !== challenger.get.length) {
      throw new Error("gl.challenges[" + challengeType + "].get receives the wrong number of arguments."
        + " You must define getChallenge as function (opts, domain, token, cb) { }");
    }
    if (!challenger.remove || 4 !== challenger.remove.length) {
      throw new Error("gl.challenges[" + challengeType + "].remove receives the wrong number of arguments."
        + " You must define removeChallenge as function (opts, domain, token, cb) { }");
    }

/*
    if (!gl._challengeWarn && (!challenger.loopback || 4 !== challenger.loopback.length)) {
      gl._challengeWarn = true;
      console.warn("gl.challenges[" + challengeType + "].loopback should be defined as function (opts, domain, token, cb) { ... } and should prove (by external means) that the ACME server challenge '" + challengeType + "' will succeed");
    }
    else if (!gl._challengeWarn && (!challenger.test || 5 !== challenger.test.length)) {
      gl._challengeWarn = true;
      console.warn("gl.challenges[" + challengeType + "].test should be defined as function (opts, domain, token, keyAuthorization, cb) { ... } and should prove (by external means) that the ACME server challenge '" + challengeType + "' will succeed");
    }
*/
  });

  gl.sni = gl.sni || null;
  gl.tlsOptions = gl.tlsOptions || gl.httpsOptions || {};

  // Workaround for https://github.com/nodejs/node/issues/22389
  gl._updateServernames = function (cert) {
    if (!gl._certnames) { gl._certnames = {}; }

    // Note: Any given domain could exist on multiple certs
    // (especially during renewal where some may be added)
    // hence we use a separate object for each domain and list each domain on it
    // to get the minimal full set associated with each cert and domain
    var allDomains = [cert.subject].concat(cert.altnames.slice(0));
    allDomains.forEach(function (name) {
      name = name.toLowerCase();
      if (!gl._certnames[name]) {
        gl._certnames[name] = {};
      }
      allDomains.forEach(function (name2) {
        name2 = name2.toLowerCase();
        gl._certnames[name][name2] = true;
      });
    });
  };
  gl._checkServername = function (safeHost, servername) {
    // odd, but acceptable
    if (!safeHost || !servername) { return true; }
    if (safeHost === servername) { return true; }
    // connection established with servername and session is re-used for allowed name
    if (gl._certnames[servername] && gl._certnames[servername][safeHost]) {
      return true;
    }
    return false;
  };

  if (!gl.tlsOptions.SNICallback) {
    if (!gl.getCertificatesAsync && !gl.getCertificates) {
      if (Array.isArray(gl.approveDomains)) {
        gl.approvedDomains = gl.approveDomains;
        gl.approveDomains = null;
      }
      if (!gl.approveDomains) {
        gl.approveDomains = function (lexOpts, certs, cb) {
          var err;
          var emsg;

          if (!gl.email) {
            throw new Error("le-sni-auto is not properly configured. Missing email");
          }
          if (!gl.agreeTos) {
            throw new Error("le-sni-auto is not properly configured. Missing agreeTos");
          }
          if (!/[a-z]/i.test(lexOpts.domain)) {
            cb(new Error("le-sni-auto does not allow IP addresses in SNI"));
            return;
          }

          if (!Array.isArray(gl.approvedDomains)) {
            // The acme-v2 package uses pre-flight test challenges to
            // verify that each requested domain is hosted by the server
            // these checks are sufficient for most use cases
            return cb(null, { options: lexOpts, certs: certs });
          }

          if (lexOpts.domains.every(function (domain) {
            return -1 !== gl.approvedDomains.indexOf(domain);
          })) {
            // commented this out because people expect to be able to edit the list of domains
            // lexOpts.domains = gl.approvedDomains.slice(0);
            lexOpts.email = gl.email;
            lexOpts.agreeTos = gl.agreeTos;
            lexOpts.communityMember = gl.communityMember;
            lexOpts.telemetry = gl.telemetry;
            return cb(null, { options: lexOpts, certs: certs });
          }

          emsg = "tls SNI for '" + lexOpts.domains.join(',') + "' rejected: not in list '" + gl.approvedDomains + "'";
          log(gl.debug, emsg, lexOpts.domains, gl.approvedDomains);
          err = new Error(emsg);
          err.code = 'E_REJECT_SNI';
          cb(err);
        };
      }

      gl.getCertificates = function (domain, certs, cb) {
        // certs come from current in-memory cache, not lookup
        log(gl.debug, 'gl.getCertificates called for', domain, 'with certs for', certs && certs.altnames || 'NONE');
        var opts = { domain: domain, domains: certs && certs.altnames || [ domain ] };

        try {
          gl.approveDomains(opts, certs, function (_err, results) {
            if (_err) {
              if (false !== gl.logRejectedDomains) {
                console.error("[Error] approveDomains rejected tls sni '" + domain + "'");
                console.error("[Error] (see https://git.coolaj86.com/coolaj86/greenlock.js/issues/11)");
                if ('E_REJECT_SNI' !== _err.code) {
                  console.error("[Error] This is the rejection message:");
                  console.error(_err.message);
                }
                console.error("");
              }
              cb(_err);
              return;
            }

            log(gl.debug, 'gl.approveDomains called with certs for', results.certs && results.certs.altnames || 'NONE', 'and options:');
            log(gl.debug, results.options);

            if (results.certs) {
              log(gl.debug, 'gl renewing');
              return gl.core.certificates.renewAsync(results.options, results.certs).then(
                function (certs) {
                  // Workaround for https://github.com/nodejs/node/issues/22389
                  gl._updateServernames(certs);
                  cb(null, certs);
                }
              , function (e) {
                  console.debug("Error renewing certificate for '" + domain + "':");
                  console.debug(e);
                  console.error("");
                  cb(e);
                }
              );
            }
            else {
              log(gl.debug, 'gl getting from disk or registering new');
              return gl.core.certificates.getAsync(results.options).then(
                function (certs) {
                  // Workaround for https://github.com/nodejs/node/issues/22389
                  gl._updateServernames(certs);
                  cb(null, certs);
                }
              , function (e) {
                  console.debug("Error loading/registering certificate for '" + domain + "':");
                  console.debug(e);
                  console.error("");
                  cb(e);
                }
              );
            }
          });
        } catch(e) {
          console.error("[ERROR] Something went wrong in approveDomains:");
          console.error(e);
          console.error("BUT WAIT! Good news: It's probably your fault, so you can probably fix it.");
        }
      };
    }
    gl.sni = gl.sni || require('le-sni-auto');
    if (gl.sni.create) {
      gl.sni = gl.sni.create(gl);
    }
    gl.tlsOptions.SNICallback = function (_domain, cb) {
      // format and (lightly) sanitize sni so that users can be naive
      // and not have to worry about SQL injection or fs discovery
      var domain = (_domain||'').toLowerCase();
      // hostname labels allow a-z, 0-9, -, and are separated by dots
      // _ is sometimes allowed
      // REGEX // https://www.codeproject.com/Questions/1063023/alphanumeric-validation-javascript-without-regex
      if (!gl.__sni_allow_dangerous_names && (!/^[a-z0-9_\.\-]+$/i.test(domain) || -1 !== domain.indexOf('..'))) {
        log(gl.debug, "invalid sni '" + domain + "'");
        cb(new Error("invalid SNI"));
        return;
      }

      try {
        gl.sni.sniCallback(gl.__sni_preserve_case && _domain || domain, cb);
      } catch(e) {
        console.error("[ERROR] Something went wrong in the SNICallback:");
        console.error(e);
        cb(e);
      }
    };
  }

  // We want to move to using tlsOptions instead of httpsOptions, but we also need to make
  // sure anything that uses this object will still work if looking for httpsOptions.
  gl.httpsOptions = gl.tlsOptions;

  if (gl.core.create) {
    gl.core = gl.core.create(gl);
  }

  gl.renew = function (args, certs) {
    return gl.core.certificates.renewAsync(args, certs);
  };

  gl.register = function (args) {
    return gl.core.certificates.getAsync(args);
  };

  gl.check = function (args) {
    // TODO must return email, domains, tos, pems
    return gl.core.certificates.checkAsync(args);
  };

  gl.middleware = gl.middleware || require('./lib/middleware');
  if (gl.middleware.create) {
    gl.middleware = gl.middleware.create(gl);
  }

  //var SERVERNAME_RE = /^[a-z0-9\.\-_]+$/;
  var SERVERNAME_G = /[^a-z0-9\.\-_]/;
  gl.middleware.sanitizeHost = function (app) {
    return function (req, res, next) {
      function realNext() {
        if ('function' === typeof app) {
          app(req, res);
        } else if ('function' === typeof next) {
          next();
        } else {
          res.statusCode = 500;
          res.end("Error: no middleware assigned");
        }
      }
      // Get the host:port combo, if it exists
      var host = (req.headers.host||'').split(':');

      // if not, move along
      if (!host[0]) { realNext(); return; }

      // if so, remove non-allowed characters
      var safehost = host[0].toLowerCase().replace(SERVERNAME_G, '');

      // if there were unallowed characters, complain
      if (!gl.__sni_allow_dangerous_names && safehost.length !== host[0].length) {
        res.statusCode = 400;
        res.end("Malformed HTTP Header: 'Host: " + host[0] + "'");
        return;
      }

      // make lowercase
      if (!gl.__sni_preserve_case) {
        host[0] = safehost;
        req.headers.host = host.join(':');
      }

      // Note: This sanitize function is also called on plain sockets, which don't need Domain Fronting checks
      if (req.socket.encrypted && !gl.__sni_allow_domain_fronting) {
        if (req.socket && 'string' === typeof req.socket.servername) {
          // Workaround for https://github.com/nodejs/node/issues/22389
          if (!gl._checkServername(safehost, req.socket.servername.toLowerCase())) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(
                "<h1>Domain Fronting Error</h1>"
              + "<p>This connection was secured using TLS/SSL for '" + req.socket.servername.toLowerCase() + "'</p>"
              + "<p>The HTTP request specified 'Host: " + safehost + "', which is (obviously) different.</p>"
              + "<p>Because this looks like a domain fronting attack, the connection has been terminated.</p>"
            );
            return;
          }
        } else if (safehost && !gl.middleware.sanitizeHost._skip_fronting_check) {
          // TODO how to handle wrapped sockets, as with telebit?
          console.warn("\n\n\n[greenlock] WARN: no string for req.socket.servername,"
            + " skipping fronting check for '" + safehost + "'\n\n\n");
          gl.middleware.sanitizeHost._skip_fronting_check = true;
        }
      }

      // carry on
      realNext();
    };
  };
  gl.middleware.sanitizeHost._skip_fronting_check = false;

  return gl;
};
