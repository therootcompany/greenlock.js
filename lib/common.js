'use strict';

var fs = require('fs');
var PromiseA = require('bluebird');

module.exports.fetchFromDisk = function (args, defaults) {
  var hostname = args.domains[0];
  var certPath = (args.fullchainPath || defaults.fullchainPath)
    || (defaults.configDir
      + (args.fullchainTpl || defaults.fullchainTpl || ':hostname/fullchain.pem').replace(/:hostname/, hostname));
  var privkeyPath = (args.privkeyPath || defaults.privkeyPath)
    || (defaults.configDir
      + (args.privkeyTpl || defaults.privkeyTpl || ':hostname/privkey.pem').replace(/:hostname/, hostname));
  var chainPath = (args.chainPath || defaults.chainPath)
    || (defaults.configDir
      + (args.chainTpl || defaults.chainTpl || ':hostname/chain.pem').replace(/:hostname/, hostname));
  /*
  var fullchainPath = (args.fullchainPath || defaults.fullchainPath)
    || (defaults.configDir
      + (args.fullchainTpl || defaults.fullchainTpl || ':hostname/fullchain.pem').replace(/:hostname/, hostname));
  */


  return PromiseA.all([
    fs.readFileAsync(privkeyPath, 'ascii')
  , fs.readFileAsync(certPath, 'ascii')
  , fs.readFileAsync(chainPath, 'ascii')
  //, fs.readFileAsync(fullchainPath, 'ascii')
    // stat the file, not the link
  , fs.statAsync(certPath)
  ]).then(function (arr) {
    // TODO parse certificate to determine lifetime and expiresAt
    return {
      key: arr[0]                           // privkey.pem
    , cert: arr[1]                          // cert.pem
    , chain: arr[2]                         // chain.pem
    , fullchain: arr[1] + '\n' + arr[2]     // fullchain.pem

    , issuedAt: arr[4].mtime.valueOf()      // ???
    };
  }, function () {
    return null;
  });
};
