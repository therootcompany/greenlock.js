'use strict';

var PromiseA = require('bluebird');
var mkdirpAsync = PromiseA.promisify(require('mkdirp'));
var path = require('path');
var fs = PromiseA.promisifyAll(require('fs'));
var sfs = require('safe-replace');

var LE = require('../');
var LeCore = PromiseA.promisifyAll(require('letiny-core'));
var leCrypto = PromiseA.promisifyAll(LeCore.leCrypto);

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

function createAccount(args, handlers) {
  var os = require("os");
  var localname = os.hostname();

  // TODO support ECDSA
  // arg.rsaBitLength args.rsaExponent
  return leCrypto.generateRsaKeypairAsync(args.rsaBitLength, args.rsaExponent).then(function (pems) {
    /* pems = { privateKeyPem, privateKeyJwk, publicKeyPem, publicKeyMd5 } */

    return LeCore.registerNewAccountAsync({
      email: args.email
    , newRegUrl: args._acmeUrls.newReg
    , agreeToTerms: function (tosUrl, agree) {
        // args.email = email; // already there
        args.tosUrl = tosUrl;
        handlers.agreeToTerms(args, agree);
      }
    , accountPrivateKeyPem: pems.privateKeyPem

    , debug: args.debug || handlers.debug
    }).then(function (body) {
      var accountDir = path.join(args.accountsDir, pems.publicKeyMd5);

      return mkdirpAsync(accountDir).then(function () {

        var isoDate = new Date().toISOString();
        var accountMeta = {
          creation_host: localname
        , creation_dt: isoDate
        };

        return PromiseA.all([
          // meta.json {"creation_host": "ns1.redirect-www.org", "creation_dt": "2015-12-11T04:14:38Z"}
          fs.writeFileAsync(path.join(accountDir, 'meta.json'), JSON.stringify(accountMeta), 'utf8')
          // private_key.json { "e", "d", "n", "q", "p", "kty", "qi", "dp", "dq" }
        , fs.writeFileAsync(path.join(accountDir, 'private_key.json'), JSON.stringify(pems.privateKeyJwk), 'utf8')
          // regr.json:
          /*
          { body: { contact: [ 'mailto:coolaj86@gmail.com' ],
           agreement: 'https://letsencrypt.org/documents/LE-SA-v1.0.1-July-27-2015.pdf',
           key: { e: 'AQAB', kty: 'RSA', n: '...' } },
            uri: 'https://acme-v01.api.letsencrypt.org/acme/reg/71272',
            new_authzr_uri: 'https://acme-v01.api.letsencrypt.org/acme/new-authz',
            terms_of_service: 'https://letsencrypt.org/documents/LE-SA-v1.0.1-July-27-2015.pdf' }
           */
        , fs.writeFileAsync(path.join(accountDir, 'regr.json'), JSON.stringify({ body: body }), 'utf8')
        ]).then(function () {
          return pems;
        });
      });
    });
  });
}

function getAccount(accountId, args, handlers) {
  var accountDir = path.join(args.accountsDir, accountId);
  var files = {};
  var configs = ['meta.json', 'private_key.json', 'regr.json'];

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

    if (!Object.keys(files).every(function (key) {
      return !files[key].error;
    })) {
      // TODO log renewal.conf
      console.warn("Account '" + accountId + "' was currupt. No big deal (I think?). Creating a new one...");
      return createAccount(args, handlers);
    }

    return leCrypto.parseAccountPrivateKeyAsync(files.private_key).then(function (keypair) {
      files.accountId = accountId;                  // md5sum(publicKeyPem)
      files.publicKeyMd5 = accountId;               // md5sum(publicKeyPem)
      files.publicKeyPem = keypair.publicKeyPem;    // ascii PEM: ----BEGIN...
      files.privateKeyPem = keypair.privateKeyPem;  // ascii PEM: ----BEGIN...
      files.privateKeyJson = keypair.private_key;   // json { n: ..., e: ..., iq: ..., etc }

      return files;
    });
  });
}

function getAccountByEmail(args) {
  // If we read 10,000 account directories looking for
  // just one email address, that could get crazy.
  // We should have a folder per email and list
  // each account as a file in the folder
  // TODO
  return PromiseA.resolve(null);
}

function getCertificateAsync(account, args, defaults, handlers) {
  var pyconf = PromiseA.promisifyAll(require('pyconf'));

  return leCrypto.generateRsaKeypairAsync(args.rsaBitLength, args.rsaExponent).then(function (domain) {
    return LeCore.getCertificateAsync({
      newAuthzUrl: args._acmeUrls.newAuthz
    , newCertUrl: args._acmeUrls.newCert

    , accountPrivateKeyPem: account.privateKeyPem
    , domainPrivateKeyPem: domain.privateKeyPem
    , domains: args.domains

    , setChallenge: function (domain, key, value, done) {
        args.domains = [domain];
        args.webrootPath = args.webrootPath || defaults.webrootPath;
        if (4 === handlers.setChallenge.length) {
          handlers.setChallenge(args, key, value, done);
        }
        else if (5 === handlers.setChallenge.length) {
          handlers.setChallenge(args, domain, key, value, done);
        }
        else {
          done(new Error("handlers.setChallenge receives the wrong number of arguments"));
        }
      }
    , removeChallenge: function (domain, key, done) {
        args.domains = [domain];
        args.webrootPath = args.webrootPath || defaults.webrootPath;
        if (3 === handlers.removeChallenge.length) {
          handlers.removeChallenge(args, key, done);
        }
        else if (4 === handlers.removeChallenge.length) {
          handlers.removeChallenge(args, domain, key, done);
        }
        else {
          done(new Error("handlers.removeChallenge receives the wrong number of arguments"));
        }
      }
    }).then(function (result) {
      // TODO write pems={ca,cert,key} to disk
      var liveDir = path.join(args.configDir, 'live', args.domains[0]);
      var certPath = path.join(liveDir, 'cert.pem');
      var fullchainPath = path.join(liveDir, 'fullchain.pem');
      var chainPath = path.join(liveDir, 'chain.pem');
      var privkeyPath = path.join(liveDir, 'privkey.pem');

      result.fullchain = result.cert + '\n' + result.ca;

      // TODO write to archive first, then write to live
      return mkdirpAsync(liveDir).then(function () {
        return PromiseA.all([
          sfs.writeFileAsync(certPath, result.cert, 'ascii')
        , sfs.writeFileAsync(chainPath, result.chain, 'ascii')
        , sfs.writeFileAsync(fullchainPath, result.fullchain, 'ascii')
        , sfs.writeFileAsync(privkeyPath, result.key, 'ascii')
        ]).then(function () {
        // TODO format result licesy
          //console.log(liveDir);
          //console.log(result);
          return {
            certPath: certPath
          , chainPath: chainPath
          , fullchainPath: fullchainPath
          , privkeyPath: privkeyPath
          };
        });
      });
    });
  });
}

function registerWithAcme(args, defaults, handlers) {
  var pyconf = PromiseA.promisifyAll(require('pyconf'));
  var server = args.server || defaults.server || LeCore.stagingServerUrl; // https://acme-v01.api.letsencrypt.org/directory
  var acmeHostname = require('url').parse(server).hostname;
  var configDir = args.configDir || defaults.configDir || LE.configDir;

  args.server = server;
  args.renewalDir = args.renewalDir || path.join(configDir, 'renewal', args.domains[0] + '.conf');
  args.accountsDir = args.accountsDir || path.join(configDir, 'accounts', acmeHostname, 'directory');

  return pyconf.readFileAsync(args.renewalDir).then(function (renewal) {
    var accountId = renewal.account;
    renewal = renewal.account;

    return accountId;
  }, function (err) {
    if ("ENOENT" === err.code) {
      return getAccountByEmail(args, handlers);
    }

    return PromiseA.reject(err);
  }).then(function (accountId) {
    // Note: the ACME urls are always fetched fresh on purpose
    return getAcmeUrls(args).then(function (urls) {
      args._acmeUrls = urls;

      if (accountId) {
        return getAccount(accountId, args, handlers);
      } else {
        return createAccount(args, handlers);
      }
    });
  }).then(function (account) {
    /*
    if (renewal.account !== account) {
      // the account has become corrupt, re-register
      return;
    }
    */

    //console.log(account);
    return fetchFromConfigLiveDir(args, defaults).then(function (certs) {
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

    /*
    cert = /home/aj/node-letsencrypt/tests/letsencrypt.config/live/lds.io/cert.pem
    privkey = /home/aj/node-letsencrypt/tests/letsencrypt.config/live/lds.io/privkey.pem
    chain = /home/aj/node-letsencrypt/tests/letsencrypt.config/live/lds.io/chain.pem
    fullchain = /home/aj/node-letsencrypt/tests/letsencrypt.config/live/lds.io/fullchain.pem

    # Options and defaults used in the renewal process
    [renewalparams]
    apache_enmod = a2enmod
    no_verify_ssl = False
    ifaces = None
    apache_dismod = a2dismod
    register_unsafely_without_email = False
    uir = None
    installer = none
    config_dir = /home/aj/node-letsencrypt/tests/letsencrypt.config
    text_mode = True
    func = <function obtain_cert at 0x7f46af0f02a8>
    prepare = False
    work_dir = /home/aj/node-letsencrypt/tests/letsencrypt.work
    tos = True
    init = False
    http01_port = 80
    duplicate = False
    key_path = None
    nginx = False
    fullchain_path = /home/aj/node-letsencrypt/chain.pem
    email = coolaj86@gmail.com
    csr = None
    agree_dev_preview = None
    redirect = None
    verbose_count = -3
    config_file = None
    renew_by_default = True
    hsts = False
    authenticator = webroot
    domains = lds.io,
    rsa_key_size = 2048
    checkpoints = 1
    manual_test_mode = False
    apache = False
    cert_path = /home/aj/node-letsencrypt/cert.pem
    webroot_path = /home/aj/node-letsencrypt/examples/../tests/acme-challenge,
    strict_permissions = False
    apache_server_root = /etc/apache2
    account = 1c41c64dfaf10d511db8aef0cc33b27f
    manual_public_ip_logging_ok = False
    chain_path = /home/aj/node-letsencrypt/chain.pem
    standalone = False
    manual = False
    server = https://acme-staging.api.letsencrypt.org/directory
    standalone_supported_challenges = "http-01,tls-sni-01"
    webroot = True
    apache_init_script = None
    user_agent = None
    apache_ctl = apache2ctl
    apache_le_vhost_ext = -le-ssl.conf
    debug = False
    tls_sni_01_port = 443
    logs_dir = /home/aj/node-letsencrypt/tests/letsencrypt.logs
    configurator = None
    [[webroot_map]]
    lds.io = /home/aj/node-letsencrypt/examples/../tests/acme-challenge
    */
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
      //require('./common').registerWithAcme(args, defaults, handlers);
      return registerWithAcme(args, defaults, handlers);
    }
  , fetchAsync: function (args) {
      return fetchFromConfigLiveDir(args, defaults);
    }
  };

  return wrapped;
};
