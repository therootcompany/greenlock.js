'use strict';

var PromiseA = require('bluebird');
var RSA = PromiseA.promisifyAll(require('rsa-compat').RSA);
var mkdirpAsync = PromiseA.promisify(require('mkdirp'));
var path = require('path');
var fs = PromiseA.promisifyAll(require('fs'));
var sfs = require('safe-replace');
var LE = require('../');
var LeCore = PromiseA.promisifyAll(require('letiny-core'));
var Accounts = require('./accounts');

var merge = require('./common').merge;
var tplCopy = require('./common').tplCopy;
var fetchFromConfigLiveDir = require('./common').fetchFromDisk;

var ipc = {}; // in-process cache

function getAcmeUrls(args) {
  var now = Date.now();

  // TODO check response header on request for cache time
  if ((now - ipc.acmeUrlsUpdatedAt) < 10 * 60 * 1000) {
    return PromiseA.resolve(ipc.acmeUrls);
  }

  return LeCore.getAcmeUrlsAsync(args.server).then(function (data) {
    ipc.acmeUrlsUpdatedAt = Date.now();
    ipc.acmeUrls = data;

    return ipc.acmeUrls;
  });
}

function readRenewalConfig(args) {
  var pyconf = PromiseA.promisifyAll(require('pyconf'));

  return pyconf.readFileAsync(args.renewalPath).then(function (pyobj) {
    return pyobj;
  }, function () {
    return pyconf.readFileAsync(path.join(__dirname, 'renewal.conf.tpl')).then(function (pyobj) {
      return pyobj;
    });
  });
}

function writeRenewalConfig(args) {
  function log() {
    if (args.debug) {
      console.log.apply(console, arguments);
    }
  }

  var pyobj = args.pyobj;
  pyobj.checkpoints = parseInt(pyobj.checkpoints, 10) || 0;

  var pyconf = PromiseA.promisifyAll(require('pyconf'));

  var liveDir = args.liveDir || path.join(args.configDir, 'live', args.domains[0]);

  var certPath = args.certPath || pyobj.cert || path.join(liveDir, 'cert.pem');
  var fullchainPath = args.fullchainPath || pyobj.fullchain || path.join(liveDir, 'fullchain.pem');
  var chainPath = args.chainPath || pyobj.chain || path.join(liveDir, 'chain.pem');
  var privkeyPath = args.privkeyPath || pyobj.privkey
    //|| args.domainPrivateKeyPath || args.domainKeyPath || pyobj.keyPath
    || path.join(liveDir, 'privkey.pem');

  log('[le/core.js] privkeyPath', privkeyPath);

  var updates = {
    account: args.account.id
  , configDir: args.configDir
  , domains: args.domains

  , email: args.email
  , tos: args.agreeTos && true
    // yes, it's an array. weird, right?
  , webrootPath: args.webrootPath && [args.webrootPath] || []
  , server: args.server || args.acmeDiscoveryUrl

  , privkey: privkeyPath
  , fullchain: fullchainPath
  , cert: certPath
  , chain: chainPath

  , http01Port: args.http01Port
  , keyPath: args.domainPrivateKeyPath || args.privkeyPath
  , rsaKeySize: args.rsaKeySize || 2048
  , checkpoints: pyobj.checkpoints
    /* // TODO XXX what's the deal with these? they don't make sense
    // are they just old junk? or do they have a meaning that I don't know about?
  , fullchainPath: path.join(args.configDir, 'chain.pem')
  , certPath: path.join(args.configDir, 'cert.pem')
  , chainPath: path.join(args.configDir, 'chain.pem')
    */ // TODO XXX end
  , workDir: args.workDir
  , logsDir: args.logsDir
  };

  // final section is completely dynamic
  // :hostname = :webroot_path
  args.domains.forEach(function (hostname) {
    updates[hostname] = args.webrootPath;
  });

  // must write back to the original pyobject or
  // annotations will be lost
  Object.keys(updates).forEach(function (key) {
    pyobj[key] = updates[key];
  });

  return mkdirpAsync(path.dirname(args.renewalPath)).then(function () {
    return pyconf.writeFileAsync(args.renewalPath, pyobj);
  }).then(function () {
    // NOTE
    // writing twice seems to causes a bug,
    // so instead we re-read the file from the disk
    return pyconf.readFileAsync(args.renewalPath);
  });
}

function getOrCreateRenewal(args) {
  return readRenewalConfig(args).then(function (pyobj) {
    var minver = pyobj.checkpoints >= 0;

    args.pyobj = pyobj;

    if (!minver) {
      args.checkpoints = 0;
      pyobj.checkpoints = 0;
      return writeRenewalConfig(args);
    }

    // args.account.id = pyobj.account
    // args.configDir = args.configDir || pyobj.configDir;

    args.checkpoints = pyobj.checkpoints;

    args.agreeTos = (args.agreeTos || pyobj.tos) && true;
    args.email = args.email || pyobj.email;
    args.domains = args.domains || pyobj.domains;

    // yes, it's an array. weird, right?
    args.webrootPath = args.webrootPath || pyobj.webrootPath[0];
    args.server = args.server || args.acmeDiscoveryUrl || pyobj.server;

    args.certPath = args.certPath || pyobj.cert;
    args.privkeyPath = args.privkeyPath || pyobj.privkey;
    args.chainPath = args.chainPath || pyobj.chain;
    args.fullchainPath = args.fullchainPath || pyobj.fullchain;

  //, workDir: args.workDir
  //, logsDir: args.logsDir
    args.rsaKeySize = args.rsaKeySize || pyobj.rsaKeySize || 2048;
    args.http01Port = args.http01Port || pyobj.http01Port;
    args.domainKeyPath = args.domainPrivateKeyPath || args.domainKeyPath || args.keyPath || pyobj.keyPath;

    return writeRenewalConfig(args);
  });
}

function writeCertificateAsync(args, defaults, handlers) {
  function log() {
    if (args.debug) {
      console.log.apply(console, arguments);
    }
  }

  log("[le/core.js] got certificate!");

  var obj = args.pyobj;
  var result = args.pems;

  result.fullchain = result.cert + '\n' + (result.chain || result.ca);
  obj.checkpoints = parseInt(obj.checkpoints, 10) || 0;

  var liveDir = args.liveDir || path.join(args.configDir, 'live', args.domains[0]);

  var certPath = args.certPath || obj.cert || path.join(liveDir, 'cert.pem');
  var fullchainPath = args.fullchainPath || obj.fullchain || path.join(liveDir, 'fullchain.pem');
  var chainPath = args.chainPath || obj.chain || path.join(liveDir, 'chain.pem');
  var privkeyPath = args.privkeyPath || obj.privkey
    //|| args.domainPrivateKeyPath || args.domainKeyPath || obj.keyPath
    || path.join(liveDir, 'privkey.pem');

  log('[le/core.js] privkeyPath', privkeyPath);

  var archiveDir = args.archiveDir || path.join(args.configDir, 'archive', args.domains[0]);

  var checkpoints = obj.checkpoints.toString();
  var certArchive = path.join(archiveDir, 'cert' + checkpoints + '.pem');
  var fullchainArchive = path.join(archiveDir, 'fullchain' + checkpoints + '.pem');
  var chainArchive = path.join(archiveDir, 'chain'+ checkpoints + '.pem');
  var privkeyArchive = path.join(archiveDir, 'privkey' + checkpoints + '.pem');

  return mkdirpAsync(archiveDir).then(function () {
    return PromiseA.all([
      sfs.writeFileAsync(certArchive, result.cert, 'ascii')
    , sfs.writeFileAsync(chainArchive, (result.chain || result.ca), 'ascii')
    , sfs.writeFileAsync(fullchainArchive, result.fullchain, 'ascii')
    , sfs.writeFileAsync(
        privkeyArchive
        // TODO nix args.key, args.domainPrivateKeyPem ??
      , (result.privkey || result.key) || RSA.exportPrivatePem(args.domainKeypair)
      , 'ascii'
      )
    ]);
  }).then(function () {
    return mkdirpAsync(liveDir);
  }).then(function () {
    return PromiseA.all([
      sfs.writeFileAsync(certPath, result.cert, 'ascii')
    , sfs.writeFileAsync(chainPath, (result.chain || result.ca), 'ascii')
    , sfs.writeFileAsync(fullchainPath, result.fullchain, 'ascii')
    , sfs.writeFileAsync(
        privkeyPath
        // TODO nix args.key, args.domainPrivateKeyPem ??
      , (result.privkey || result.key) || RSA.exportPrivatePem(args.domainKeypair)
      , 'ascii'
      )
    ]);
  }).then(function () {
    obj.checkpoints += 1;
    args.checkpoints += 1;

    return writeRenewalConfig(args);
  }).then(function () {
    var getCertInfo = require('./cert-info').getCertInfo;

    // XXX Note: Parsing the certificate info comes at a great cost (~500kb)
    var certInfo = getCertInfo(result.cert);

    return {
      certPath: certPath
    , chainPath: chainPath
    , fullchainPath: fullchainPath
    , privkeyPath: privkeyPath

      // TODO nix keypair
    , keypair: args.domainKeypair

      // TODO nix args.key, args.domainPrivateKeyPem ??
      // some ambiguity here...
    , privkey: (result.privkey || result.key) || RSA.exportPrivatePem(args.domainKeypair)
    , fullchain: result.fullchain || (result.cert + '\n' + result.chain)
    , chain:  (result.chain || result.ca)
      // especially this one... might be cert only, might be fullchain
    , cert: result.cert

    , issuedAt: Date(certInfo.notBefore.value).valueOf() // Date.now()
    , expiresAt: Date(certInfo.notAfter.value).valueOf()
    , lifetime: defaults.lifetime || handlers.lifetime
    };
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

  log('[le/core.js] domainKeyPath:', args.domainKeyPath);

  promise = fs.readFileAsync(args.domainKeyPath, 'ascii').then(function (pem) {
    return RSA.import({ privateKeyPem: pem });
  }, function (/*err*/) {
    return RSA.generateKeypairAsync(args.rsaKeySize || 2048, 65537, keypairOpts).then(function (keypair) {
      return mkdirpAsync(path.dirname(args.domainKeyPath)).then(function () {
        return fs.writeFileAsync(args.domainKeyPath, keypair.privateKeyPem, 'ascii').then(function () {
          return keypair;
        });
      });
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

    , challengeType: args.challengeType || 'http-01'

      //
      // IMPORTANT
      //
      // setChallenge and removeChallenge are handed defaults
      // instead of args because getChallenge does not have
      // access to args
      // (args is per-request, defaults is per instance)
      //
    , setChallenge: function (domain, key, value, done) {
        var copy = merge(defaults, { domains: [domain] });
        tplCopy(copy);

        args.domains = [domain];
        args.webrootPath = args.webrootPath;
        if (4 === handlers.setChallenge.length) {
          handlers.setChallenge(copy, key, value, done);
        }
        else if (5 === handlers.setChallenge.length) {
          handlers.setChallenge(copy, domain, key, value, done);
        }
        else {
          done(new Error("handlers.setChallenge receives the wrong number of arguments"));
        }
      }
    , removeChallenge: function (domain, key, done) {
        var copy = merge(defaults, { domains: [domain] });
        tplCopy(copy);

        if (3 === handlers.removeChallenge.length) {
          handlers.removeChallenge(copy, key, done);
        }
        else if (4 === handlers.removeChallenge.length) {
          handlers.removeChallenge(copy, domain, key, done);
        }
        else {
          done(new Error("handlers.removeChallenge receives the wrong number of arguments"));
        }
      }
    });
  }).then(function (results) {
    // { cert, chain, fullchain, privkey }
    args.pems = results;
    return writeCertificateAsync(args, defaults, handlers);
  });
}

function getOrCreateDomainCertificate(args, defaults, handlers) {
  if (args.duplicate) {
    // we're forcing a refresh via 'dupliate: true'
    return getCertificateAsync(args, defaults, handlers);
  }

  return fetchFromConfigLiveDir(args).then(function (certs) {
    var halfLife = certs && ((certs.expiresAt - certs.issuedAt) / 2);

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

  var pyconf = PromiseA.promisifyAll(require('pyconf'));

  return pyconf.readFileAsync(args.renewalPath).then(function (renewal) {
    var accountId = renewal.account;
    renewal = renewal.account;

    return accountId;
  }, function (err) {
    if ("ENOENT" === err.code) {
      log("[le/core.js] try email");
      return Accounts.getAccountIdByEmail(args, handlers);
    }

    return PromiseA.reject(err);
  }).then(function (accountId) {

    // Note: the ACME urls are always fetched fresh on purpose
    return getAcmeUrls(args).then(function (urls) {
      args._acmeUrls = urls;

      if (accountId) {
        log('[le/core.js] use account');

        args.accountId = accountId;
        return Accounts.getAccount(args, handlers);
      } else {
        log('[le/core.js] create account');
        return Accounts.createAccount(args, handlers);
      }
    });
  }).then(function (account) {
    /*
    if (renewal.account !== account) {
      // the account has become corrupt, re-register
      return;
    }
    */
    log('[le/core.js] created account');
    return account;
  });
/*
  return fs.readdirAsync(accountsDir, function (nodes) {
    return PromiseA.all(nodes.map(function (node) {
      var reMd5 = /[a-f0-9]{32}/i;
      if (reMd5.test(node)) {
      }
    }));
  });
*/
}

module.exports.create = function (defaults, handlers) {
  defaults.server = defaults.server || LE.liveServer;

  var wrapped = {
    registerAsync: function (args) {
      var copy;
      // TODO move these defaults elsewhere?
      //args.renewalDir = args.renewalDir || ':config/renewal/';
      args.renewalPath = args.renewalPath || ':config/renewal/:hostname.conf';
      // Note: the /directory is part of the server url and, as such, bleeds into the pathname
      // So :config/accounts/:server/directory is *incorrect*, but the following *is* correct:
      args.accountsDir = args.accountsDir || ':config/accounts/:server';
      copy = merge(args, defaults);
      tplCopy(copy);

      var url = require('url');
      var acmeLocation = url.parse(copy.server);
      var acmeHostpath = path.join(acmeLocation.hostname, acmeLocation.pathname);
      copy.renewalPath = copy.renewalPath || path.join(copy.configDir, 'renewal', copy.domains[0] + '.conf');
      copy.accountsDir = copy.accountsDir || path.join(copy.configDir, 'accounts', acmeHostpath);

      return getOrCreateAcmeAccount(copy, defaults, handlers).then(function (account) {
        copy.account = account;

        return getOrCreateRenewal(copy).then(function (pyobj) {

          copy.pyobj = pyobj;
          return getOrCreateDomainCertificate(copy, defaults, handlers);
        });
      }).then(function (result) {
        return result;
      }, function (err) {
        return PromiseA.reject(err);
      });
    }
  , fetchAsync: function (args) {
      var copy = merge(args, defaults);
      tplCopy(copy);

      return fetchFromConfigLiveDir(copy, defaults);
    }
  , configureAsync: function (hargs) {
      hargs.renewalPath = hargs.renewalPath || ':config/renewal/:hostname.conf';
      var copy = merge(hargs, defaults);
      tplCopy(copy);

      return getOrCreateAcmeAccount(copy, defaults, handlers).then(function (account) {
        copy.account = account;
        return getOrCreateRenewal(copy);
      });
    }
  , getConfigAsync: function (hargs) {
      hargs.renewalPath = hargs.renewalPath || ':config/renewal/:hostname.conf';
      hargs.domains = [];

      var copy = merge(hargs, defaults);
      tplCopy(copy);

      return readRenewalConfig(copy).then(function (pyobj) {
        var exists = pyobj.checkpoints >= 0;
        if (!exists) {
          return null;
        }

        return pyobj;
      });
    }
  , getConfigsAsync: function (hargs) {
      hargs.renewalDir = hargs.renewalDir || ':config/renewal/';
      hargs.renewalPath = hargs.renewalPath || ':config/renewal/:hostname.conf';
      hargs.domains = [];

      var copy = merge(hargs, defaults);
      tplCopy(copy);

      return fs.readdirAsync(copy.renewalDir).then(function (nodes) {
        nodes = nodes.filter(function (node) {
          return /^[a-z0-9]+.*\.conf$/.test(node);
        });

        return PromiseA.all(nodes.map(function (node) {
          copy.domains = [node.replace(/\.conf$/, '')];
          return wrapped.getConfigAsync(copy);
        }));
      });
    }
  };

  return wrapped;
};
