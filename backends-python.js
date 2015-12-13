'use strict';

var PromiseA = require('bluebird');
var fs = PromiseA.promisifyAll(require('fs'));

module.exports.create = function (leBinPath, defaults) {
  defaults.webroot = true;
  defaults.renewByDefault = true;

  var LEP = require('letsencrypt-python');
  var lep = PromiseA.promisifyAll(LEP.create(leBinPath, { debug: true }));
  var wrapped = {
    registerAsync: function (args) {
      return lep.registerAsync('certonly', args);
    }
  , fetchAsync: function (args) {
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
          // TODO parse centificate
        , issuedAt: arr[2].mtime.valueOf()
        };
      }, function () {
        return null;
      });
    }
  };

  return wrapped;
}
