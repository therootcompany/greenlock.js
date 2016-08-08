'use strict';

var ACME = require('le-acme-core').ACME;

var LE = module.exports;
LE.LE = LE;
// in-process cache, shared between all instances
var ipc = {};

LE.defaults = {
  productionServerUrl: ACME.productionServerUrl
, stagingServerUrl: ACME.stagingServerUrl

, rsaKeySize: ACME.rsaKeySize || 2048
, challengeType: ACME.challengeType || 'http-01'

, acmeChallengePrefix: ACME.acmeChallengePrefix
};

// backwards compat
Object.keys(LE.defaults).forEach(function (key) {
  LE[key] = LE.defaults[key];
});

// show all possible options
var u; // undefined
LE._undefined = {
  acme: u
, store: u
, challenger: u
, register: u
, check: u
, renewWithin: u
, memorizeFor: u
, acmeChallengePrefix: u
, rsaKeySize: u
, challengeType: u
, server: u
, agreeToTerms: u
, _ipc: u
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
  var PromiseA = require('bluebird');

  le.acme = le.acme || ACME.create({ debug: le.debug });
  le.store = le.store || require('le-store-certbot').create({ debug: le.debug });
  le.challenger = le.challenger || require('le-store-certbot').create({ debug: le.debug });
  le.core = require('./lib/core');

  le = LE._undefine(le);
  le.acmeChallengePrefix = LE.acmeChallengePrefix;
  le.rsaKeySize = le.rsaKeySize || LE.rsaKeySize;
  le.challengeType = le.challengeType || LE.challengeType;
  le._ipc = ipc;

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

  if (le.acme.create) {
    le.acme = le.acme.create(le);
  }
  le.acme = PromiseA.promisifyAll(le.acme);
  le._acmeOpts = le.acme.getOptions();
  Object.keys(le._acmeOpts).forEach(function (key) {
    if (!(key in le)) {
      le[key] = le._acmeOpts[key];
    }
  });

  if (le.store.create) {
    le.store = le.store.create(le);
  }
  le.store = PromiseA.promisifyAll(le.store);
  le._storeOpts = le.store.getOptions();
  Object.keys(le._storeOpts).forEach(function (key) {
    if (!(key in le)) {
      le[key] = le._storeOpts[key];
    }
  });

  if (le.challenger.create) {
    le.challenger = le.challenger.create(le);
  }
  le.challenger = PromiseA.promisifyAll(le.challenger);
  le._challengerOpts = le.challenger.getOptions();
  Object.keys(le._challengerOpts).forEach(function (key) {
    if (!(key in le)) {
      le[key] = le._challengerOpts[key];
    }
  });

  if (le.core.create) {
    le.core = le.core.create(le);
  }

  le.register = function (args) {
    return le.core.certificates.getAsync(args);
  };

  le.check = function (args) {
    // TODO must return email, domains, tos, pems
    return le.core.certificates.checkAsync(args);
  };

  le.middleware = function () {
    return require('./lib/middleware')(le);
  };

  return le;
};
