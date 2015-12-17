'use strict';

var PromiseA = require('bluebird');
var LeCore = require('letiny-core');
var leCrypto = LeCore.leCrypto;
var path = require('path');
var mkdirpAsync = PromiseA.promisify(require('mkdirp'));
var fs = PromiseA.promisifyAll(require('fs'));

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

function getAccountByEmail(/*args*/) {
  // If we read 10,000 account directories looking for
  // just one email address, that could get crazy.
  // We should have a folder per email and list
  // each account as a file in the folder
  // TODO
  return PromiseA.resolve(null);
}

module.exports.getAccountByEmail = getAccountByEmail;
module.exports.getAccount = getAccount;
