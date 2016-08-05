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

var u; // undefined
LE._undefined = {
  store: u
, challenger: u
, register: u
, check: u
, renewWithin: u
, memorizeFor: u
, acmeChallengePrefix: u
};
LE._undefine = function (le) {
  Object.keys(LE._undefined).forEach(function (key) {
    if (!(key in le)) {
      le[key] = u;
    }
  });

  return le;
};
LE.create = function (le) {
  le = LE._undefine(le);
  var store = le.store || require('le-store-certbot').create({ debug: le.debug });
  var challenger = le.challenge || require('le-store-certbot').create({ debug: le.debug });
  var core = le.core = require('./lib/core');

  le.acmeChallengePrefix = LE.acmeChallengePrefix;

  if (!le.renewWithin) { le.renewWithin = 3 * 24 * 60 * 60 * 1000; }
  if (!le.memorizeFor) { le.memorizeFor = 1 * 24 * 60 * 60 * 1000; }

  if (!le.server) {
    throw new Error("opts.server must be set to 'staging' or a production url, such as LE.productionServerUrl'");
  }
  if ('staging' === le.server) {
    le.server = LE.stagingServerUrl;
  }
  else if ('production' === le.server) {
    le.server = LE.productionServerUrl;
  }

  if (store.create) {
    store = store.create(le);
  }
  store = PromiseA.promisifyAll(store);
  le._storeOpts = store.getOptions();
  Object.keys(le._storeOpts).forEach(function (key) {
    if (!(key in le._storeOpts)) {
      le[key] = le._storeOpts[key];
    }
  });

  if (challenger.create) {
    challenger = challenger.create(le);
  }
  challenger = PromiseA.promisifyAll(challenger);
  le._challengerOpts = challenger.getOptions();
  Object.keys(le._storeOpts).forEach(function (key) {
    if (!(key in le._challengerOpts)) {
      le[key] = le._challengerOpts[key];
    }
  });

  core = le.core = core.create(le);

  le.register = function (args) {
    return core.registerAsync(args);
  };

  le.check = function (args) {
    // TODO must return email, domains, tos, pems
    return core.fetchAsync(args);
  };

  le.middleware = function () {
    return require('./lib/middleware')(le);
  };

  return le;
};
