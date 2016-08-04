'use strict';

var PromiseA = require('bluebird');
var mkdirpAsync = PromiseA.promisify(require('mkdirp'));
var path = require('path');
var fs = PromiseA.promisifyAll(require('fs'));
var sfs = require('safe-replace');

var fetchFromConfigLiveDir = function (args) {
  // TODO NO HARD-CODED DEFAULTS
  if (!args.fullchainPath || !args.privkeyPath || !args.certPath || !args.chainPath) {
    console.warn("missing one or more of args.privkeyPath, args.fullchainPath, args.certPath, args.chainPath");
    console.warn("hard-coded conventional pathnames were for debugging and are not a stable part of the API");
  }

  //, fs.readFileAsync(fullchainPath, 'ascii')
  // note: if this ^^ gets added back in, the arrays below must change
  return PromiseA.all([
    fs.readFileAsync(args.privkeyPath, 'ascii')   // 0
  , fs.readFileAsync(args.certPath, 'ascii')      // 1
  , fs.readFileAsync(args.chainPath, 'ascii')     // 2

    // stat the file, not the link
  , fs.statAsync(args.certPath)                   // 3
  ]).then(function (arr) {
    var cert = arr[1];
    var getCertInfo = require('./cert-info').getCertInfo;

    // XXX Note: Parsing the certificate info comes at a great cost (~500kb)
    var certInfo = getCertInfo(cert);

    return {
      key: arr[0]                           // privkey.pem
    , privkey: arr[0]                       // privkey.pem

    , fullchain: arr[1] + '\n' + arr[2]     // fullchain.pem
    , cert: cert                            // cert.pem

    , chain: arr[2]                         // chain.pem
    , ca: arr[2]                            // chain.pem

    , privkeyPath: args.privkeyPath
    , fullchainPath: args.fullchainPath
    , certPath: args.certPath
    , chainPath: args.chainPath

    //, issuedAt: arr[3].mtime.valueOf()
    , issuedAt: Date(certInfo.notBefore.value).valueOf() // Date.now()
    , expiresAt: Date(certInfo.notAfter.value).valueOf()
    , lifetime: args.lifetime
    };
  }, function (err) {
    if (args.debug) {
      console.error("[letsencrypt/lib/common.js] fetchFromDisk");
      console.error(err.stack);
    }
    return null;
  });
};

function getAccount(args) {
  var accountId = args.accountId;
  var accountDir = path.join(args.accountsDir, accountId);
  var files = {};
  var configs = [ 'meta.json', 'private_key.json', 'regr.json' ];

  return PromiseA.all(configs.map(function (filename) {
    var keyname = filename.slice(0, -5);

    return fs.readFileAsync(path.join(accountDir, filename), 'utf8').then(function (text) {
      var data;

      try {
        data = JSON.parse(text);
      } catch(e) {
        files[keyname] = { error: e };
        return;
      }

      files[keyname] = data;
    }, function (err) {
      files[keyname] = { error: err };
    });
  })).then(function () {
    var err;

    if (!Object.keys(files).every(function (key) {
      return !files[key].error;
    }) || !files.private_key || !files.private_key.n) {
      err = new Error("Account '" + accountId + "' was corrupt. No big deal (I think?). Creating a new one...");
      err.code = 'E_ACCOUNT_CORRUPT';
      err.data = files;
      return PromiseA.reject(err);
    }

    //files.private_key;
    //files.regr;
    //files.meta;
    files.accountId = accountId;                  // preserve current account id
    files.id = accountId;
    files.keypair = { privateKeyJwk: files.private_key };

    return files;
  });
}

function getAccountIdByEmail(args) {
  // If we read 10,000 account directories looking for
  // just one email address, that could get crazy.
  // We should have a folder per email and list
  // each account as a file in the folder
  // TODO
  var email = args.email;
  if ('string' !== typeof email) {
    if (args.debug) {
      console.log("[LE] No email given");
    }
    return PromiseA.resolve(null);
  }
  return fs.readdirAsync(args.accountsDir).then(function (nodes) {
    if (args.debug) {
      console.log("[LE] arg.accountsDir success");
    }

    return PromiseA.all(nodes.map(function (node) {
      return fs.readFileAsync(path.join(args.accountsDir, node, 'regr.json'), 'utf8').then(function (text) {
        var regr = JSON.parse(text);
        regr.__accountId = node;

        return regr;
      });
    })).then(function (regrs) {
      var accountId;

      /*
      if (args.debug) {
        console.log('read many regrs');
        console.log('regrs', regrs);
      }
      */

      regrs.some(function (regr) {
        return regr.body.contact.some(function (contact) {
          var match = contact.toLowerCase() === 'mailto:' + email.toLowerCase();
          if (match) {
            accountId = regr.__accountId;
            return true;
          }
        });
      });

      if (!accountId) {
        return null;
      }

      return accountId;
    });
  }).then(function (accountId) {
    return accountId;
  }, function (err) {
    if ('ENOENT' === err.code) {
      // ignore error
      return null;
    }

    return PromiseA.reject(err);
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
  , rsaKeySize: args.rsaKeySize
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
    args.rsaKeySize = args.rsaKeySize || pyobj.rsaKeySize;
    args.http01Port = args.http01Port || pyobj.http01Port;
    args.domainKeyPath = args.domainPrivateKeyPath || args.domainKeyPath || args.keyPath || pyobj.keyPath;

    return writeRenewalConfig(args);
  });
}

function writeCertificateAsync(args) {
  function log() {
    if (args.debug) {
      console.log.apply(console, arguments);
    }
  }

  log("[le/core.js] got certificate!");

  var obj = args.pyobj;
  var pems = args.pems;

  pems.fullchain = pems.cert + '\n' + (pems.chain || pems.ca);
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
      sfs.writeFileAsync(certArchive, pems.cert, 'ascii')
    , sfs.writeFileAsync(chainArchive, (pems.chain || pems.ca), 'ascii')
    , sfs.writeFileAsync(fullchainArchive, pems.fullchain, 'ascii')
    , sfs.writeFileAsync(
        privkeyArchive
        // TODO nix args.key, args.domainPrivateKeyPem ??
      , (pems.privkey || pems.key) // || RSA.exportPrivatePem(args.domainKeypair)
      , 'ascii'
      )
    ]);
  }).then(function () {
    return mkdirpAsync(liveDir);
  }).then(function () {
    return PromiseA.all([
      sfs.writeFileAsync(certPath, pems.cert, 'ascii')
    , sfs.writeFileAsync(chainPath, (pems.chain || pems.ca), 'ascii')
    , sfs.writeFileAsync(fullchainPath, pems.fullchain, 'ascii')
    , sfs.writeFileAsync(
        privkeyPath
        // TODO nix args.key, args.domainPrivateKeyPem ??
      , (pems.privkey || pems.key) // || RSA.exportPrivatePem(args.domainKeypair)
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
    var certInfo = getCertInfo(pems.cert);

    return {
      certPath: certPath
    , chainPath: chainPath
    , fullchainPath: fullchainPath
    , privkeyPath: privkeyPath

      // TODO nix keypair
    , keypair: args.domainKeypair

      // TODO nix args.key, args.domainPrivateKeyPem ??
      // some ambiguity here...
    , privkey: (pems.privkey || pems.key) //|| RSA.exportPrivatePem(args.domainKeypair)
    , fullchain: pems.fullchain || (pems.cert + '\n' + pems.chain)
    , chain:  (pems.chain || pems.ca)
      // especially this one... might be cert only, might be fullchain
    , cert: pems.cert

    , issuedAt: Date(certInfo.notBefore.value).valueOf() // Date.now()
    , expiresAt: Date(certInfo.notAfter.value).valueOf()
    };
  });
}

module.exports.create = function (/*defaults*/) {
  function getConfigAsync(copy) {
    copy.domains = [];

    return readRenewalConfig(copy).then(function (pyobj) {
      var exists = pyobj.checkpoints >= 0;
      if (!exists) {
        return null;
      }

      return pyobj;
    });
  }

  return {
    getDefaults: function () {
LE.tplConfigDir = require('./lib/common').tplConfigDir;
  // replaces strings of workDir, certPath, etc
  // if they have :config/etc/live or :conf/etc/archive
  // to instead have the path of the configDir
  LE.tplConfigDir(defaults.configDir, defaults);
      return {
        configDir: require('homedir')() + '/letsencrypt/etc'    // /etc/letsencrypt/
      , logsDir: ':config/log'                                  // /var/log/letsencrypt/
      , workDir: leCore.workDir // /var/lib/letsencrypt/
      , accountsDir: ':config/accounts/:server'
      , renewalPath: ':config/renewal/:hostname.conf'
      , renewalDir: ':config/renewal/'
      , privkeyPath: ':config/live/:hostname/privkey.pem'
      , fullchainPath: ':config/live/:hostname/fullchain.pem'
      , certPath: ':config/live/:hostname/cert.pem'
      , chainPath: ':config/live/:hostname/chain.pem'
      , renewalPath: ':config/renewal/:hostname.conf'
      , accountsDir: ':config/accounts/:server'
      };
    }
  , getPrivatePemAsync: function (args) {
      return fs.readFileAsync(args.domainKeyPath, 'ascii');
    }
  , setPrivatePemAsync: function (args, keypair) {
      return mkdirpAsync(path.dirname(args.domainKeyPath)).then(function () {
        return fs.writeFileAsync(args.domainKeyPath, keypair.privateKeyPem, 'ascii').then(function () {
          return keypair;
        });
      });
    }
  , setRegistrationAsync: function (args) {
      return writeCertificateAsync(args);
    }

  , getRegistrationAsync: function (args) {
      return fetchFromConfigLiveDir(args);
    }
  , getOrCreateRenewalAsync: function (args) {
      return getOrCreateRenewal(args);
    }
  , getConfigAsync: getConfigAsync
  , getConfigsAsync: function (copy) {
      copy.domains = [];

      return fs.readdirAsync(copy.renewalDir).then(function (nodes) {
        nodes = nodes.filter(function (node) {
          return /^[a-z0-9]+.*\.conf$/.test(node);
        });

        return PromiseA.all(nodes.map(function (node) {
          copy.domains = [node.replace(/\.conf$/, '')];
          return getConfigAsync(copy);
        }));
      });
    }
  , fetchAsync: function (args) {
      return fetchFromConfigLiveDir(args);
    }
  , getAccountIdByEmailAsync: getAccountIdByEmail
  , getAccountAsync: getAccount
  , setAccountAsync: function (args, account) {
      var isoDate = new Date().toISOString();
      var os = require("os");
      var localname = os.hostname();
      var accountDir = path.join(args.accountsDir, account.accountId);

      account.meta = account.meta || {
        creation_host: localname
      , creation_dt: isoDate
      };

      return mkdirpAsync(accountDir).then(function () {
        var RSA = require('rsa-compat').RSA;

        // TODO abstract file writing
        return PromiseA.all([
          // meta.json {"creation_host": "ns1.redirect-www.org", "creation_dt": "2015-12-11T04:14:38Z"}
          fs.writeFileAsync(path.join(accountDir, 'meta.json'), JSON.stringify(account.meta), 'utf8')
          // private_key.json { "e", "d", "n", "q", "p", "kty", "qi", "dp", "dq" }
        , fs.writeFileAsync(path.join(accountDir, 'private_key.json'), JSON.stringify(RSA.exportPrivateJwk(account.keypair)), 'utf8')
          // regr.json:
          /*
          { body: { contact: [ 'mailto:coolaj86@gmail.com' ],
           agreement: 'https://letsencrypt.org/documents/LE-SA-v1.0.1-July-27-2015.pdf',
           key: { e: 'AQAB', kty: 'RSA', n: '...' } },
            uri: 'https://acme-v01.api.letsencrypt.org/acme/reg/71272',
            new_authzr_uri: 'https://acme-v01.api.letsencrypt.org/acme/new-authz',
            terms_of_service: 'https://letsencrypt.org/documents/LE-SA-v1.0.1-July-27-2015.pdf' }
           */
        , fs.writeFileAsync(path.join(accountDir, 'regr.json'), JSON.stringify(account.regr), 'utf8')
        ]);
      });
    }
  , getAccountIdAsync: function (args) {
      var pyconf = PromiseA.promisifyAll(require('pyconf'));

      return pyconf.readFileAsync(args.renewalPath).then(function (renewal) {
        var accountId = renewal.account;
        renewal = renewal.account;

        return accountId;
      }, function (err) {
        if ("ENOENT" === err.code) {
          return getAccountIdByEmail(args);
        }

        return PromiseA.reject(err);
      });
    }
  };
};
