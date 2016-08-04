'use strict';

var certInfo = module.exports;

// this is really memory expensive to do
// (about half of a megabyte of loaded code)
certInfo._pemToBinAb  = function (pem) {
  var b64 = pem.replace(/(-----(BEGIN|END) CERTIFICATE-----|[\n\r])/g, '');
  var buf = Buffer(b64, 'base64');
  var ab = new Uint8Array(buf).buffer;          // WORKS
  //var ab = buf.buffer                         // Doesn't work

  return ab;
};
certInfo.getCertInfo = function (pem) {
  var ab = module.exports._pemToBinAb(pem);
  var merge = require("node.extend");

  var common = require("asn1js/org/pkijs/common");
  var _asn1js = require("asn1js");
  var _pkijs = require("pkijs");
  var _x509schema = require("pkijs/org/pkijs/x509_schema");

  // #region Merging function/object declarations for ASN1js and PKIjs
  var asn1js = merge(true, _asn1js, common);

  var x509schema = merge(true, _x509schema, asn1js);

  var pkijs_1 = merge(true, _pkijs, asn1js);
  var pkijs = merge(true, pkijs_1, x509schema);

  var asn1 = pkijs.org.pkijs.fromBER(ab);
  var certSimpl = new pkijs.org.pkijs.simpl.CERT({ schema: asn1.result });

  return certSimpl;
};

certInfo.getCertInfoFromFile = function (pemFile) {
  return require('fs').readFileSync(pemFile, 'ascii');
};

certInfo.testGetCertInfo = function () {
  var path = require('path');
  var pemFile = path.join(__dirname, '..', 'tests', 'example.cert.pem');
  return certInfo.getCertInfo(certInfo.getCertInfoFromFile(pemFile));
};

if (require.main === module) {
  var c = certInfo.testGetCertInfo();

  console.log('');

  console.log(c.notBefore.value);
  console.log(Date(c.notBefore.value).valueOf());

  console.log('');

  console.log(c.notAfter.value);
  console.log(Date(c.notAfter.value).valueOf());

  console.log('');
}
