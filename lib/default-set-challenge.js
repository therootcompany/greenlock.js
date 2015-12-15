'use strict';

var fs = require('fs');
var path = require('path');

module.exports = function (args, challengePath, keyAuthorization, done) {
  //var hostname = args.domains[0];
  var mkdirp = require('mkdirp');

  // TODO should be args.webrootPath
  mkdirp(path.join(args.webrootPath, challengePath), function (err) {
    if (err) {
      done(err);
      return;
    }

    fs.writeFile(path.join(args.webrootPath, challengePath), keyAuthorization, 'utf8', function (err) {
      done(err);
    });
  });
};
