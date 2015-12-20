'use strict';

var PromiseA = require('bluebird');
var mkdirpAsync = PromiseA.promisify(require('mkdirp'));
var path = require('path');
var sfs = require('safe-replace');
var LE = require('../');
var LeCore = PromiseA.promisifyAll(require('letiny-core'));
var leCrypto = PromiseA.promisifyAll(LeCore.leCrypto);
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

function writeCertificateAsync(result, args, defaults, handlers) {
  if (args.debug) {
    console.log("got certificate!");
  }

  result.fullchain = result.cert + '\n' + result.ca;

  var pyconf = PromiseA.promisifyAll(require('pyconf'));

  return pyconf.readFileAsync(args.renewalPath).then(function (obj) {
    return obj;
  }, function () {
    return pyconf.readFileAsync(path.join(__dirname, 'renewal.conf.tpl')).then(function (obj) {
      return obj;
    });
  }).then(function (obj) {
    obj.checkpoint = parseInt(obj.checkpoint, 10) || 0;

    var liveDir = args.liveDir || path.join(args.configDir, 'live', args.domains[0]);

    var certPath = args.certPath || obj.cert || path.join(liveDir, 'cert.pem');
    var fullchainPath = args.fullchainPath || obj.fullchain || path.join(liveDir, 'fullchain.pem');
    var chainPath = args.chainPath || obj.chain || path.join(liveDir, 'chain.pem');
    var privkeyPath = args.domainPrivateKeyPath || args.domainKeyPath
      || obj.privkey || obj.keyPath
      || path.join(liveDir, 'privkey.pem');

    var archiveDir = args.archiveDir || path.join(args.configDir, 'archive', args.domains[0]);

    var checkpoint = obj.checkpoint.toString();
    var certArchive = path.join(archiveDir, 'cert' + checkpoint + '.pem');
    var fullchainArchive = path.join(archiveDir, 'fullchain' + checkpoint + '.pem');
    var chainArchive = path.join(archiveDir, 'chain'+ checkpoint + '.pem');
    var privkeyArchive = path.join(archiveDir, 'privkey' + checkpoint + '.pem');

    return mkdirpAsync(archiveDir).then(function () {
      return PromiseA.all([
        sfs.writeFileAsync(certArchive, result.cert, 'ascii')
      , sfs.writeFileAsync(chainArchive, result.ca || result.chain, 'ascii')
      , sfs.writeFileAsync(fullchainArchive, result.fullchain, 'ascii')
      , sfs.writeFileAsync(privkeyArchive, result.key || result.privkey || args.domainPrivateKeyPem, 'ascii')
      ]);
    }).then(function () {
      return mkdirpAsync(liveDir);
    }).then(function () {
      return PromiseA.all([
        sfs.writeFileAsync(certPath, result.cert, 'ascii')
      , sfs.writeFileAsync(chainPath, result.ca || result.chain, 'ascii')
      , sfs.writeFileAsync(fullchainPath, result.fullchain, 'ascii')
      , sfs.writeFileAsync(privkeyPath, result.key || result.privkey || args.domainPrivateKeyPem, 'ascii')
      ]);
    }).then(function () {
      obj.checkpoint += 1;

      var updates = {
        cert: certPath
      , privkey: privkeyPath
      , chain: chainPath
      , fullchain: fullchainPath
      , configDir: args.configDir
      , workDir: args.workDir
      , tos: args.agreeTos && true
      , http01Port: args.http01Port
      , keyPath: args.domainPrivateKeyPath || args.privkeyPath
      , email: args.email
      , domains: args.domains
      , rsaKeySize: args.rsaKeySize
      , checkpoints: obj.checkpoint
        // TODO XXX what's the deal with these? they don't make sense
        // are they just old junk? or do they have a meaning that I don't know about?
      , fullchainPath: path.join(args.configDir, 'chain.pem')
      , certPath: path.join(args.configDir, 'cert.pem')
      , chainPath: path.join(args.configDir, 'chain.pem')
        // TODO XXX end
        // yes, it's an array. weird, right?
      , webrootPath: args.webrootPath && [args.webrootPath] || []
      , account: account.accountId
      , server: args.server || args.acmeDiscoveryUrl
      , logsDir: args.logsDir
      };

      // final section is completely dynamic
      // :hostname = :webroot_path
      args.domains.forEach(function (hostname) {
        updates[hostname] = args.webrootPath;
      });

      // must write back to the original object or
      // annotations will be lost
      Object.keys(updates).forEach(function (key) {
        obj[key] = updates[key];
      });

      return mkdirpAsync(path.dirname(args.renewalPath)).then(function () {
        return pyconf.writeFileAsync(args.renewalPath, obj);
      });
    }).then(function () {

      return {
        certPath: certPath
      , chainPath: chainPath
      , fullchainPath: fullchainPath
      , privkeyPath: privkeyPath

        // some ambiguity here...
      , privkey: result.key || result.privkey
      , fullchain: result.fullchain || result.cert
      , chain: result.ca || result.chain
        // especially this one... might be cert only, might be fullchain
      , cert: result.cert

      , issuedAt: Date.now()
      , lifetime: defaults.lifetime || handlers.lifetime
      };
    });
  });
}

function getCertificateAsync(account, args, defaults, handlers) {
  return leCrypto.generateRsaKeypairAsync(args.rsaKeySize, 65537).then(function (domainKey) {
    if (args.debug) {
      console.log("get certificate");
    }

    args.domainPrivateKeyPem = domainKey.privateKeyPem;

    return LeCore.getCertificateAsync({
      debug: args.debug

    , newAuthzUrl: args._acmeUrls.newAuthz
    , newCertUrl: args._acmeUrls.newCert

    , accountPrivateKeyPem: account.privateKeyPem
    , domainPrivateKeyPem: domainKey.privateKeyPem
    , domains: args.domains

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
    writeCertificateAsync(results, args, defaults, handlers);
  });
}

function getOrCreateDomainCertificate(account, args, defaults, handlers) {
  return fetchFromConfigLiveDir(args).then(function (certs) {
    // if nothing, register and save
    // if something, check date (don't register unless 30+ days)
    // if good, don't bother registering
    // (but if we get to the point that we're actually calling
    // this function, that shouldn't be the case, right?)
    //console.log(certs);
    if (!certs) {
      // no certs, seems like a good time to get some
      return getCertificateAsync(account, args, defaults, handlers);
    }
    else if (certs.issuedAt > (27 * 24 * 60 * 60 * 1000)) {
      // cert is at least 27 days old we can renew that
      return getCertificateAsync(account, args, defaults, handlers);
    }
    else if (args.duplicate) {
      // YOLO! I be gettin' fresh certs 'erday! Yo!
      return getCertificateAsync(account, args, defaults, handlers);
    }
    else {
      console.warn('[WARN] Ignoring renewal attempt for certificate less than 27 days old. Use args.duplicate to force.');
      // We're happy with what we have
      return certs;
    }
  });
};

function getOrCreateAcmeAccount(args, defaults, handlers) {
  var pyconf = PromiseA.promisifyAll(require('pyconf'));
  var server = args.server;
  var acmeHostname = require('url').parse(server).hostname;
  var configDir = args.configDir;

  args.renewalPath = args.renewalPath || path.join(configDir, 'renewal', args.domains[0] + '.conf');
  args.accountsDir = args.accountsDir || path.join(configDir, 'accounts', acmeHostname, 'directory');

  return pyconf.readFileAsync(args.renewalPath).then(function (renewal) {
    var accountId = renewal.account;
    renewal = renewal.account;

    return accountId;
  }, function (err) {
    if ("ENOENT" === err.code) {
      if (args.debug) {
        console.log("[LE] try email");
      }
      return Accounts.getAccountIdByEmail(args, handlers);
    }

    return PromiseA.reject(err);
  }).then(function (accountId) {

    // Note: the ACME urls are always fetched fresh on purpose
    return getAcmeUrls(args).then(function (urls) {
      args._acmeUrls = urls;

      if (accountId) {
        if (args.debug) {
          console.log('[LE] use account');
        }
        return Accounts.getAccount(accountId, args, handlers);
      } else {
        if (args.debug) {
          console.log('[LE] create account');
        }
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

      if (args.debug) {
        console.log('[LE DEBUG] reg domains', args.domains);
      }
      return getOrCreateAcmeAccount(copy, defaults, handlers).then(function (account) {
        console.log('AAAAAAAAAACCCCCCCCCCCCCCCCOOOOOOOOOOOOOOUUUUUUUUUUUUUUUNNNNNNNNNNNNNNNNTTTTTTTTTTTT');
        console.log(account);
        return getOrCreateDomainCertificate(account, copy, defaults, handlers);
      });
    }
  , fetchAsync: function (args) {
      var copy = merge(args, defaults);
      tplCopy(copy);

      if (args.debug) {
        console.log('[LE DEBUG] fetch domains', copy);
      }
      return fetchFromConfigLiveDir(copy, defaults);
    }
  };

  return wrapped;
};
