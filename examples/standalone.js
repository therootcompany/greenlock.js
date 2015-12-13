'use strict';

var path = require('path');
var leBinPath = require('homedir')() + '/.local/share/letsencrypt/bin/letsencrypt';
var LEP = require('letsencrypt-python');
var lep = LEP.create(leBinPath, { debug: true });
var conf = {
  domains: process.argv[2]
, email: process.argv[3]
, agree: process.argv[4]
};
var port = 80;
var tlsPort = 5001;

if (!conf.domains || !conf.email || !conf.agree) {
  console.error("Usage: letsencrypt <domain1,domain2> <email> agree");
  console.error("Example: letsencrypt example.com,www.example.com user@example.com agree");
  return;
}

// backend-specific defaults
// Note: For legal reasons you should NOT set email or agreeTos as a default
var bkDefaults = {
  webroot: true
, webrootPath: path.join(__dirname, '..', 'tests', 'acme-challenge')
, fullchainTpl: '/live/:hostname/fullchain.pem'
, privkeyTpl: '/live/:hostname/privkey.pem'
, configDir: path.join(__dirname, '..', 'tests', 'letsencrypt.config')
, logsDir: path.join(__dirname, '..', 'tests', 'letsencrypt.logs')
, workDir: path.join(__dirname, '..', 'tests', 'letsencrypt.work')
, server: LEP.stagingServer
, text: true
};
var le = require('../').create(lep, bkDefaults, {
/*
  setChallenge: function () {
    // the python backend needs fs.watch implemented
    // before this would work (and even then it would be difficult)
, getChallenge: function () {
    // 
  }
  }
, sniRegisterCallback: function () {
  }
*/
});

var localCerts = require('localhost.daplie.com-certificates');
var express = require('express');
var app = express();

app.use('/', le.middleware());

var server = require('http').createServer();
server.on('request', app);
server.listen(port, function () {
  console.log('Listening http', server.address());
});

var tlsServer = require('https').createServer({
  key: localCerts.key
, cert: localCerts.cert
, SNICallback: le.sniCallback
});
tlsServer.on('request', app);
tlsServer.listen(tlsPort, function () {
  console.log('Listening http', tlsServer.address());
});

le.register({
  agreeTos: 'agree' === conf.agree
, domains: conf.domains.split(',')
, email: conf.email
}, function (err) {
  if (err) {
    console.error('[Error]: node-letsencrypt/examples/standalone');
    console.error(err.stack);
  } else {
    console.log('success');
  }

  server.close();
  tlsServer.close();
});
