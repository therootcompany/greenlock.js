'use strict';

var fs = require('fs');
var PromiseA = require('bluebird');

var re = /^[a-zA-Z0-9\.\-]+$/;
var punycode = require('punycode');

mudole.exports.isValidDomain = function (domain) {
  if (re.test(domain)) {
    return domain;
  }

  domain = punycode.toASCII(domain);

  if (re.test(domain)) {
    return domain;
  }

  return '';
};

module.exports.tplConfigDir = function merge(configDir, defaults) {
  Object.keys(defaults).forEach(function (key) {
    if ('string' === typeof defaults[key]) {
      defaults[key] = defaults[key].replace(':config', configDir).replace(':conf', configDir);
    }
  });
};

module.exports.merge = function merge(defaults, args) {
  var copy = {};

  Object.keys(defaults).forEach(function (key) {
    copy[key] = defaults[key];
  });
  Object.keys(args).forEach(function (key) {
    copy[key] = args[key];
  });

  return copy;
};

module.exports.tplHostname = function merge(hostname, copy) {
  Object.keys(copy).forEach(function (key) {
    if ('string' === typeof copy[key]) {
      copy[key] = copy[key].replace(':hostname', hostname).replace(':host', hostname);
    }
  });

  //return copy;
};

module.exports.fetchFromDisk = function (args) {
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

    return {
      key: arr[0]                           // privkey.pem
    , privkey: arr[0]                       // privkey.pem

    , fullchain: arr[1] + '\n' + arr[2]     // fullchain.pem
    , cert: arr[1]                          // cert.pem

    , chain: arr[2]                         // chain.pem
    , ca: arr[2]                            // chain.pem

    , privkeyPath: args.privkeyPath
    , fullchainPath: args.fullchainPath
    , certPath: args.certPath
    , chainPath: args.chainPath

    , issuedAt: arr[3].mtime.valueOf()      // ??? TODO parse to determine expiresAt and lifetime
    , lifetime: args.lifetime
    };
  }, function (err) {
    if (args.debug) {
      console.error(err.stack);
    }
    return null;
  });
};
