'use strict';

var path = require('path');
var homeRe = new RegExp("^~(\\/|\\\|\\" + path.sep + ")");
var re = /^[a-zA-Z0-9\.\-]+$/;
var punycode = require('punycode');

module.exports.attachCertInfo = function (results) {
  var getCertInfo = require('./cert-info').getCertInfo;
  // XXX Note: Parsing the certificate info comes at a great cost (~500kb)
  var certInfo = getCertInfo(results.cert);

  //results.issuedAt = arr[3].mtime.valueOf()
  results.issuedAt = Date(certInfo.notBefore.value).valueOf(); // Date.now()
  results.expiresAt = Date(certInfo.notAfter.value).valueOf();

  return results;
};

module.exports.isValidDomain = function (domain) {
  if (re.test(domain)) {
    return domain;
  }

  domain = punycode.toASCII(domain);

  if (re.test(domain)) {
    return domain;
  }

  return '';
};

module.exports.merge = function (/*defaults, args*/) {
  var allDefaults = Array.prototype.slice.apply(arguments);
  var args = args.shift();
  var copy = {};

  allDefaults.forEach(function (defaults) {
    Object.keys(defaults).forEach(function (key) {
      copy[key] = defaults[key];
    });
  });

  Object.keys(args).forEach(function (key) {
    copy[key] = args[key];
  });

  return copy;
};

module.exports.tplCopy = function (copy) {
  var homedir = require('homedir')();
  var tpls = {
    hostname: (copy.domains || [])[0]
  , server: (copy.server || '').replace('https://', '').replace(/(\/)$/, '')
  , conf: copy.configDir
  , config: copy.configDir
  };

  Object.keys(copy).forEach(function (key) {
    if ('string' !== typeof copy[key]) {
      return;
    }

    copy[key] = copy[key].replace(homeRe, homedir + path.sep);

    Object.keys(tpls).sort(function (a, b) {
      return b.length - a.length;
    }).forEach(function (tplname) {
      if (!tpls[tplname]) {
        // what can't be templated now may be templatable later
        return;
      }
      copy[key] = copy[key].replace(':' + tplname, tpls[tplname]);
    });
  });

  return copy;
};
