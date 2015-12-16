'use strict';

var fs = require('fs');
var path = require('path');

module.exports.agreeToTerms = function (args, agree) {
  agree(null, args.agreeTos);
};

module.exports.setChallenge = function (args, challengePath, keyAuthorization, done) {
  //var hostname = args.domains[0];
  var mkdirp = require('mkdirp');

  // TODO should be args.webrootPath
  //console.log('args.webrootPath, challengePath');
  //console.log(args.webrootPath, challengePath);
  mkdirp(args.webrootPath, function (err) {
    if (err) {
      done(err);
      return;
    }

    fs.writeFile(path.join(args.webrootPath, challengePath), keyAuthorization, 'utf8', function (err) {
      done(err);
    });
  });
};

module.exports.getChallenge = function (args, key, done) {
  //var hostname = args.domains[0];

  //console.log("getting the challenge", args, key);
  fs.readFile(path.join(args.webrootPath, key), 'utf8', done);
};

module.exports.removeChallenge = function (args, key, done) {
  //var hostname = args.domains[0];

  fs.unlink(path.join(args.webrootPath, key), done);
};
