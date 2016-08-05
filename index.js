'use strict';

// TODO handle www and no-www together somehow?

var PromiseA = require('bluebird');
var leCore = require('letiny-core');

var LE = module.exports;

LE.defaults = {
  server: leCore.productionServerUrl
, stagingServer: leCore.stagingServerUrl
, liveServer: leCore.productionServerUrl

, productionServerUrl: leCore.productionServerUrl
, stagingServerUrl: leCore.stagingServerUrl

, acmeChallengePrefix: leCore.acmeChallengePrefix
};

// backwards compat
Object.keys(LE.defaults).forEach(function (key) {
  LE[key] = LE.defaults[key];
});

LE.create = function (defaults, handlers, backend) {
  var Core = require('./lib/core');
  var core;
  if (!backend) { backend = require('./lib/pycompat'); }
  if (!handlers) { handlers = {}; }
  if (!handlers.renewWithin) { handlers.renewWithin = 3 * 24 * 60 * 60 * 1000; }
  if (!handlers.memorizeFor) { handlers.memorizeFor = 1 * 24 * 60 * 60 * 1000; }
  if (!handlers.sniRegisterCallback) {
    handlers.sniRegisterCallback = function (args, cache, cb) {
      // TODO when we have ECDSA, just do this automatically
      cb(null, null);
    };
  }

  if (backend.create) {
    backend = backend.create(defaults);
  }
  backend = PromiseA.promisifyAll(backend);
  core = Core.create(defaults, handlers, backend);

  var le = {
    backend: backend
  , core: core
    // register
  , create: function (args, cb) {
      return core.registerAsync(args).then(function (pems) {
        cb(null, pems);
      }, cb);
    }
    // fetch
  , domain: function (args, cb) {
      // TODO must return email, domains, tos, pems
      return core.fetchAsync(args).then(function (certInfo) {
        cb(null, certInfo);
      }, cb);
    }
  , domains: function (args, cb) {
      // TODO show all domains or limit by account
      throw new Error('not implemented');
    }
  , accounts: function (args, cb) {
      // TODO show all accounts or limit by domain
      throw new Error('not implemented');
    }
  , account: function (args, cb) {
      // TODO return one account
      throw new Error('not implemented');
    }
  };

  // exists
  // get

  return le;
};
