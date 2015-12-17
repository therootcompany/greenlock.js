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
var tplHostname = require('./common').tplHostname;
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



function getCertificateAsync(account, args, defaults, handlers) {
  return leCrypto.generateRsaKeypairAsync(args.rsaBitLength, args.rsaExponent).then(function (domain) {
    return LeCore.getCertificateAsync({
      newAuthzUrl: args._acmeUrls.newAuthz
    , newCertUrl: args._acmeUrls.newCert

    , accountPrivateKeyPem: account.privateKeyPem
    , domainPrivateKeyPem: domain.privateKeyPem
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
        tplHostname(domain, copy);

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
        tplHostname(domain, copy);

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
    }).then(function (result) {
      var liveDir = path.join(args.configDir, 'live', args.domains[0]);
      var certPath = path.join(liveDir, 'cert.pem');
      var fullchainPath = path.join(liveDir, 'fullchain.pem');
      var chainPath = path.join(liveDir, 'chain.pem');
      var privkeyPath = path.join(liveDir, 'privkey.pem');

      result.fullchain = result.cert + '\n' + result.ca;

      // TODO write to archive first, then write to live

      // XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
      // TODO read renewal.conf.default, write renewal.conf
      // var pyconf = PromiseA.promisifyAll(require('pyconf'));
      // XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

      return mkdirpAsync(liveDir).then(function () {
        return PromiseA.all([
          sfs.writeFileAsync(certPath, result.cert, 'ascii')
        , sfs.writeFileAsync(chainPath, result.ca || result.chain, 'ascii')
        , sfs.writeFileAsync(fullchainPath, result.fullchain, 'ascii')
        , sfs.writeFileAsync(privkeyPath, result.key || result.privkey, 'ascii')
        ]).then(function () {
        // TODO format result licesy
          //console.log(liveDir);
          //console.log(result);
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
    });
  });
}

function registerWithAcme(args, defaults, handlers) {
  var pyconf = PromiseA.promisifyAll(require('pyconf'));
  var server = args.server;
  var acmeHostname = require('url').parse(server).hostname;
  var configDir = args.configDir;

  args.server = server;
  args.renewalDir = args.renewalDir || path.join(configDir, 'renewal', args.domains[0] + '.conf');
  args.accountsDir = args.accountsDir || path.join(configDir, 'accounts', acmeHostname, 'directory');

  return pyconf.readFileAsync(args.renewalDir).then(function (renewal) {
    var accountId = renewal.account;
    renewal = renewal.account;

    return accountId;
  }, function (err) {
    if ("ENOENT" === err.code) {
      return Accounts.getAccountByEmail(args, handlers);
    }

    return PromiseA.reject(err);
  }).then(function (accountId) {
    // Note: the ACME urls are always fetched fresh on purpose
    return getAcmeUrls(args).then(function (urls) {
      args._acmeUrls = urls;

      if (accountId) {
        return Accounts.getAccount(accountId, args, handlers);
      } else {
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

    //console.log(account);
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
      var copy = merge(args, defaults);
      tplHostname(args.domains[0], copy);

      if (args.debug) {
        console.log('[LE DEBUG] reg domains', args.domains);
      }
      return registerWithAcme(copy, defaults, handlers);
    }
  , fetchAsync: function (args) {
      var copy = merge(args, defaults);
      tplHostname(args.domains[0], copy);

      if (args.debug) {
        console.log('[LE DEBUG] fetch domains', copy);
      }
      return fetchFromConfigLiveDir(copy, defaults);
    }
  };

  return wrapped;
};
