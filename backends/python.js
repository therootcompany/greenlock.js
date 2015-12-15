'use strict';

var PromiseA = require('bluebird');
var fs = PromiseA.promisifyAll(require('fs'));

module.exports.create = function (defaults, opts, extra) {
  // v1.0.0 backwards compat
  if (3 === arguments.length) {
    opts.pythonClientPath = defaults;
    defaults = opts;
    opts = extra;
  }
  else if (2 !== arguments.length) {
    throw new Error("Instead of creating the python backend yourself, just pass it to LE. See the README.md");
  }

  defaults.webroot = true;
  defaults.renewByDefault = true;
  defaults.text = true;

  var leBinPath = defaults.pythonClientPath;
  var LEP = require('letsencrypt-python');
  var lep = PromiseA.promisifyAll(LEP.create(leBinPath, opts));
  var wrapped = {
    registerAsync: function (args) {
      return lep.registerAsync('certonly', args);
    }
  , fetchAsync: function (args) {
      require('./common').fetchFromDisk(args, defaults);
    }
  };

  return wrapped;
};
