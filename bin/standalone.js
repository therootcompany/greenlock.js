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
, privkeyTpl: '/live/:hostname/fullchain.pem'
, configDir: path.join(__dirname, '..', 'tests', 'letsencrypt.config')
, logsDir: path.join(__dirname, '..', 'tests', 'letsencrypt.logs')
, workDir: path.join(__dirname, '..', 'tests', 'letsencrypt.work')
, server: LEP.stagingServer
, text: true
};
var le = require('../').create(lep, bkDefaults, {
});

var localCerts = require('localhost.daplie.com-certificates');
var express = require('express');
var app = express();

app.use('/', function (req, res, next) {
  console.log('[DEBUG]', req.method, req.protocol, req.hostname, req.url);
  next();
});
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
}).then(function () {
  console.log('success');
}, function (err) {
  console.error(err.stack);
}).then(function () {
  server.close();
  tlsServer.close();
});
