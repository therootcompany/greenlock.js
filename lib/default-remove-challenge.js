'use strict';

var path = require('path');
var fs = require('fs');

module.exports = function (args, key, done) {
  //var hostname = args.domains[0];

  fs.unlinkSync(path.join(args.webroot, key), done);
};
