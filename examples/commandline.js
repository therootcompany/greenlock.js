'use strict';

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

var LE = require('../');
var path = require('path');
// backend-specific defaults will be passed through
// Note: Since agreeTos is a legal agreement, I would suggest not accepting it by default
var bkDefaults = {
  webrootPath: path.join(__dirname, '..', 'tests', 'acme-challenge')
, fullchainTpl: '/live/:hostname/fullchain.pem'
, privkeyTpl: '/live/:hostname/privkey.pem'
, configDir: path.join(__dirname, '..', 'tests', 'letsencrypt.config')
, server: LE.stagingServer

// backend-specific
, logsDir: path.join(__dirname, '..', 'tests', 'letsencrypt.logs')
, workDir: path.join(__dirname, '..', 'tests', 'letsencrypt.work')
};

var le = LE.create(bkDefaults, {
/*
  setChallenge: function (hostnames, key, value, cb) {
    // the python backend needs fs.watch implemented
    // before this would work (and even then it would be difficult)
  }
, getChallenge: function (hostnames, key, cb) {
    //
  }
, sniRegisterCallback: function (args, certInfo, cb) {

  }
, registrationFailureCallback: function (args, certInfo, cb) {
    what do to when a backgrounded registration fails
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
