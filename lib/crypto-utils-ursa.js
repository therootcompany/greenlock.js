'use strict';

var crypto = require('crypto');
var ursa = require('ursa');
var forge = require('node-forge');

function binstr2b64(binstr) {
  return new Buffer(binstr, 'binary').toString('base64');
}

function toAcmePrivateKey(privkeyPem) {
  var forgePrivkey = forge.pki.privateKeyFromPem(privkeyPem);

  return {
    kty: "RSA"
  , n: binstr2b64(forgePrivkey.n)
  , e: binstr2b64(forgePrivkey.e)
  , d: binstr2b64(forgePrivkey.d)
  , p: binstr2b64(forgePrivkey.p)
  , q: binstr2b64(forgePrivkey.q)
  , dp: binstr2b64(forgePrivkey.dP)
  , dq: binstr2b64(forgePrivkey.dQ)
  , qi: binstr2b64(forgePrivkey.qInv)
  };
}

function generateRsaKeypair(bitlen, exp, cb) {
  var keypair = ursa.generatePrivateKey(bitlen /*|| 2048*/, exp /*65537*/);
  var pems = {
    publicKeyPem: keypair.toPublicPem()   // ascii PEM: ----BEGIN...
  , privateKeyPem: keypair.toPrivatePem() // ascii PEM: ----BEGIN...
  };

  // I would have chosen sha1 or sha2... but whatever
  pems.publicKeyMd5 = crypto.createHash('md5').update(pems.publicKeyPem).digest('hex');
  // json { n: ..., e: ..., iq: ..., etc }
  pems.privateKeyJwk = toAcmePrivateKey(pems.privateKeyPem);
  pems.privateKeyJson = pems.privateKeyJwk;

  // TODO thumbprint

  cb(null, pems);
}

function parseAccountPrivateKey(pkj, cb) {
  Object.keys(pkj).forEach(function (key) {
    pkj[key] = new Buffer(pkj[key], 'base64');
  });

  var priv;

  try {
    priv = ursa.createPrivateKeyFromComponents(
      pkj.n // modulus
    , pkj.e // exponent
    , pkj.p
    , pkj.q
    , pkj.dp
    , pkj.dq
    , pkj.qi
    , pkj.d
    );
  } catch(e) {
    cb(e);
    return;
  }

  cb(null, {
    privateKeyPem: priv.toPrivatePem.toString('ascii')
  , publicKeyPem: priv.toPrivatePem.toString('ascii')
  });
}

module.exports.parseAccountPrivateKey = parseAccountPrivateKey;
module.exports.generateRsaKeypair = generateRsaKeypair;
module.exports.toAcmePrivateKey = toAcmePrivateKey;
