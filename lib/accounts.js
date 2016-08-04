'use strict';

var PromiseA = require('bluebird');
var crypto = require('crypto');
var LeCore = require('letiny-core');
var RSA = PromiseA.promisifyAll(require('rsa-compat').RSA);
var path = require('path');
var mkdirpAsync = PromiseA.promisify(require('mkdirp'));
var fs = PromiseA.promisifyAll(require('fs'));

function createAccount(args, handlers) {
  var os = require("os");
  var localname = os.hostname();

  // arg.rsaBitLength args.rsaExponent
  return RSA.generateKeypairAsync(args.rsaKeySize || 2048, 65537, { public: true, pem: true }).then(function (keypair) {

    return LeCore.registerNewAccountAsync({
      email: args.email
    , newRegUrl: args._acmeUrls.newReg
    , agreeToTerms: function (tosUrl, agree) {
        // args.email = email; // already there
        args.tosUrl = tosUrl;
        handlers.agreeToTerms(args, agree);
      }
    , accountKeypair: keypair

    , debug: args.debug || handlers.debug
    }).then(function (body) {
      // TODO XXX use sha256 (the python client uses md5)
      // TODO ssh fingerprint (noted on rsa-compat issues page, I believe)
      keypair.publicKeyMd5 = crypto.createHash('md5').update(RSA.exportPublicPem(keypair)).digest('hex');
      keypair.publicKeySha256 = crypto.createHash('sha256').update(RSA.exportPublicPem(keypair)).digest('hex');
      var accountId = keypair.publicKeyMd5;
      var accountDir = path.join(args.accountsDir, accountId);
      var regr = { body: body };

      args.accountId = accountId;
      args.accountDir = accountDir;

      return mkdirpAsync(accountDir).then(function () {

        var isoDate = new Date().toISOString();
        var accountMeta = {
          creation_host: localname
        , creation_dt: isoDate
        };

        // TODO abstract file writing
        return PromiseA.all([
          // meta.json {"creation_host": "ns1.redirect-www.org", "creation_dt": "2015-12-11T04:14:38Z"}
          fs.writeFileAsync(path.join(accountDir, 'meta.json'), JSON.stringify(accountMeta), 'utf8')
          // private_key.json { "e", "d", "n", "q", "p", "kty", "qi", "dp", "dq" }
        , fs.writeFileAsync(path.join(accountDir, 'private_key.json'), JSON.stringify(RSA.exportPrivateJwk(keypair)), 'utf8')
          // regr.json:
          /*
          { body: { contact: [ 'mailto:coolaj86@gmail.com' ],
           agreement: 'https://letsencrypt.org/documents/LE-SA-v1.0.1-July-27-2015.pdf',
           key: { e: 'AQAB', kty: 'RSA', n: '...' } },
            uri: 'https://acme-v01.api.letsencrypt.org/acme/reg/71272',
            new_authzr_uri: 'https://acme-v01.api.letsencrypt.org/acme/new-authz',
            terms_of_service: 'https://letsencrypt.org/documents/LE-SA-v1.0.1-July-27-2015.pdf' }
           */
        , fs.writeFileAsync(path.join(accountDir, 'regr.json'), JSON.stringify(regr), 'utf8')
        ]).then(function () {
          var pems = {};

          // pems.private_key;
          pems.meta = accountMeta;
          pems.keypair = keypair;
          pems.regr = regr;
          pems.accountId = accountId;
          pems.id = accountId;
          return pems;
        });
      });
    });
  });
}

function getAccount(args, handlers) {
  var accountId = args.accountId;
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
      console.warn("Account '" + accountId + "' was corrupt. No big deal (I think?). Creating a new one...");
      //console.log(accountId, files);
      return createAccount(args, handlers);
    }

    var keypair = { privateKeyJwk: files.private_key };
    keypair.privateKeyPem = RSA.exportPrivatePem(keypair);
    keypair.publicKeyPem = RSA.exportPublicPem(keypair);

    //files.private_key;
    //files.regr;
    //files.meta;
    files.accountId = accountId;                  // preserve current account id
    files.id = accountId;
    files.keypair = keypair;

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

module.exports.getAccountIdByEmail = getAccountIdByEmail;
module.exports.getAccount = getAccount;
module.exports.createAccount = createAccount;
