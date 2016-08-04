'use strict';

var fs = require('fs');
var path = require('path');
var PromiseA = require('bluebird');

var homeRe = new RegExp("^~(\\/|\\\|\\" + path.sep + ")");
var re = /^[a-zA-Z0-9\.\-]+$/;
var punycode = require('punycode');

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

module.exports.tplConfigDir = function (configDir, defaults) {
  var homedir = require('homedir')();
  Object.keys(defaults).forEach(function (key) {
    if ('string' === typeof defaults[key]) {
      defaults[key] = defaults[key].replace(':config', configDir).replace(':conf', configDir);
      defaults[key] = defaults[key].replace(homeRe, homedir + path.sep);
    }
  });
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
  var url = require('url');
  var acmeLocation = url.parse(copy.server);
  var acmeHostpath = path.join(acmeLocation.hostname, acmeLocation.pathname);
  copy.accountsDir = copy.accountsDir || path.join(copy.configDir, 'accounts', acmeHostpath);
  // TODO move these defaults elsewhere?
  //args.renewalDir = args.renewalDir || ':config/renewal/';
  args.renewalPath = args.renewalPath || ':config/renewal/:hostname.conf';
  // Note: the /directory is part of the server url and, as such, bleeds into the pathname
  // So :config/accounts/:server/directory is *incorrect*, but the following *is* correct:
  args.accountsDir = args.accountsDir || ':config/accounts/:server';
  hargs.renewalDir = hargs.renewalDir || ':config/renewal/';
  copy.renewalPath = copy.renewalPath || path.join(copy.configDir, 'renewal', copy.domains[0] + '.conf');
  var homedir = require('homedir')();
  var tpls = {
    hostname: (copy.domains || [])[0]
  , server: (copy.server || '').replace('https://', '').replace(/(\/)$/, '')
  , conf: copy.configDir
  , config: copy.configDir
  };

  Object.keys(copy).forEach(function (key) {
    if ('string' === typeof copy[key]) {
      Object.keys(tpls).sort(function (a, b) {
        return b.length - a.length;
      }).forEach(function (tplname) {
        if (!tpls[tplname]) {
          // what can't be templated now may be templatable later
          return;
        }
        copy[key] = copy[key].replace(':' + tplname, tpls[tplname]);
        copy[key] = copy[key].replace(homeRe, homedir + path.sep);
      });
    }
  });

  //return copy;
};
