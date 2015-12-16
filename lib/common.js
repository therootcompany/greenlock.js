'use strict';

var fs = require('fs');
var PromiseA = require('bluebird');

module.exports.fetchFromDisk = function (args, defaults) {
  var hostname = args.domains[0];
  var crtpath = defaults.configDir + defaults.fullchainTpl.replace(/:hostname/, hostname);
  var privpath = defaults.configDir + defaults.privkeyTpl.replace(/:hostname/, hostname);

  return PromiseA.all([
    fs.readFileAsync(privpath, 'ascii')
  , fs.readFileAsync(crtpath, 'ascii')
    // stat the file, not the link
  , fs.statAsync(crtpath)
  ]).then(function (arr) {
    return {
      key: arr[0]  // privkey.pem
    , cert: arr[1] // fullchain.pem
      // TODO parse centificate for lifetime / expiresAt
    , issuedAt: arr[2].mtime.valueOf()
    };
  }, function () {
    return null;
  });
};
