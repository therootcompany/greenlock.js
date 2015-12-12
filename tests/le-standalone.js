'use strict';

var config = require('./config');
var Letsencrypt = require('../');
var leBinPath = '/home/user/.local/share/letsencrypt/bin/letsencrypt';
var LEP = require('letsencrypt-python');
var lep = LEP.create(leBinPath);

require('./serve-acme-challenges').create({
  configDir: config.configDir
});

//var networkInterfaces = require('os').networkInterfaces();
//var ipify = require('ipify');

var le = Letsencrypt.create(
  lep
  // set some defaults
, { configDir: config.configDir
  , workDir: config.workDir
  , logsDir: config.logsDir

  , webroot: true
  , webrootPath: config.webrootPath

  , server: LEP.stagingServer
  }
, { cacheContextsFor: 1 * 60 * 60 * 1000 // 1 hour
  , cacheRenewChecksFor: 3 * 24 * 60 * 60 * 1000 // 3 days
  }
);

le.register({
  agreeTos: true
, domains: ['lds.io']
, email: 'coolaj86@gmail.com'
});
