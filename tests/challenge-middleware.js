'use strict';

var PromiseA = require('bluebird');
var requestAsync = PromiseA.promisify(require('request'));
var LE = require('../').LE;
var le = LE.create({
  server: 'staging'
, acme: require('le-acme-core').ACME.create()
, store: require('le-store-certbot').create({
    configDir: '~/letsencrypt.test/etc'
  , webrootPath: '~/letsencrypt.test/var/:hostname'
  })
, challenge: require('le-challenge-fs').create({
    webrootPath: '~/letsencrypt.test/var/:hostname'
  })
, debug: true
});
var utils = require('../lib/utils');

if ('/.well-known/acme-challenge/' !== LE.acmeChallengePrefix) {
  throw new Error("Bad constant 'acmeChallengePrefix'");
}

var baseUrl;
var domain = 'example.com';
var token = 'token-id';
var secret = 'key-secret';

var tests = [
  function () {
    console.log('Test Url:', baseUrl + token);
    return requestAsync({ url: baseUrl + token }).then(function (req) {
      if (404 !== req.statusCode) {
        console.log(req.statusCode);
        throw new Error("Should be status 404");
      }
    });
  }

, function () {
    var copy = utils.merge({}, le);
    copy = utils.tplCopy(copy);
    return PromiseA.promisify(le.challenge.set)(copy, domain, token, secret);
  }

, function () {
    return requestAsync(baseUrl + token).then(function (req) {
      if (200 !== req.statusCode) {
        console.log(req.statusCode, req.body);
        throw new Error("Should be status 200");
      }

      if (req.body !== secret) {
        console.error(token, secret, req.body);
        throw new Error("req.body should be secret");
      }
    });
  }

, function () {
    var copy = utils.merge({}, le);
    copy = utils.tplCopy(copy);
    return PromiseA.promisify(le.challenge.remove)(copy, domain, token);
  }

, function () {
    return requestAsync(baseUrl + token).then(function (req) {
      if (404 !== req.statusCode) {
        console.log(req.statusCode);
        throw new Error("Should be status 404");
      }
    });
  }
];

function run() {
  //var express = require(express);
  var server = require('http').createServer(le.middleware());
  server.listen(0, function () {
    console.log('Server running, proceeding to test.');
    baseUrl = 'http://localhost.daplie.com:' + server.address().port + LE.acmeChallengePrefix;

    function next() {
      var test = tests.shift();
      if (!test) {
        console.info('All tests passed');
        server.close();
        return;
      }

      test().then(next, function (err) {
        console.error('ERROR');
        console.error(err.stack);
        server.close();
      });
    }

    next();
  });
}

run();
