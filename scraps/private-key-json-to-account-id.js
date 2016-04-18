'use strict';

var fs = require('fs');
var crypto = require('crypto');
var ursa = require('ursa');

// Here are all the places you can discover the account id:
//
// letsencrypt/account.py
//
// /etc/letsencrypt/accounts/{{ server }}/directory/{{ accountId }}/private_key.json
// /etc/letsencrypt/accounts/acme-v01.api.letsencrypt.org/directory/f4c33502df3789849f617944253b35ae/private_key.json
//
// /etc/letsencrypt/renewal/{{ hostname }}.conf
// /etc/letsencrypt/renewal/example.com.conf
//
// Note: each domain has its own private key

function fromPrivateKeyUrsa(priv, cb) {
  var pub = priv.toPublicPem();
  var accountId = crypto.createHash('md5').update(pub).digest('hex');

  cb(null, accountId);
}

function fromAccountPrivateKey(pkj, cb) {
  Object.keys(pkj).forEach(function (key) {
    pkj[key] = new Buffer(pkj[key], 'base64');
  });

  var priv = ursa.createPrivateKeyFromComponents(
    pkj.n // modulus
  , pkj.e // exponent
  , pkj.p
  , pkj.q
  , pkj.dp
  , pkj.dq
  , pkj.qi
  , pkj.d
  );

  fromPrivateKeyUrsa(priv, cb);
}

function fromAccountPrivateKeyFile(privateKeyPath, cb) {
  // Read ACME account key
  fs.readFile(privateKeyPath, 'utf8', function (err, privkeyJson) {
    var pkj;

    if (err) {
      cb(err);
      return;
    }

    try {
      pkj = JSON.parse(privkeyJson);
    } catch(e) {
      cb(e);
      return;
    }

    fromAccountPrivateKey(pkj, cb);
  });
}

function bogusAccountId(cb) {
  var priv = ursa.generatePrivateKey(2048, 65537);

  fromPrivateKeyUrsa(priv, cb);
}

module.exports.bogusAccountId = bogusAccountId;
module.exports.fromAccountPrivateKey = fromAccountPrivateKey;

module.exports.bogusAccountId(function (err, id) {
  console.log('Random Account Id', id);
});
module.exports.fromAccountPrivateKey('/etc/letsencrypt/live/example.com/privkey.pem', function (err, id) {
  console.log(id);
});
