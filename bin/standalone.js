'use strict';

var homedir = require('homedir');
var leBinPath = homedir() + '/.local/share/letsencrypt/bin/letsencrypt';
var lep = require('letsencrypt-python').create(leBinPath);
var conf = {
  domains: process.argv[2]
, email: process.argv[3]
, agree: process.argv[4]
};

// backend-specific defaults
// Note: For legal reasons you should NOT set email or agreeTos as a default
var bkDefaults = {
  webroot: true
, webrootPath: __dirname + '/acme-challenge'
, fullchainTpl: '/live/:hostname/fullchain.pem'
, privkeyTpl: '/live/:hostname/fullchain.pem'
, configDir: '/etc/letsencrypt'
, logsDir: '/var/log/letsencrypt'
, workDir: '/var/lib/letsencrypt'
, text: true
};
var le = require('letsencrypt').create(lep, bkDefaults);

var localCerts = require('localhost.daplie.com-certificates');
var express = require('express');
var app = express();

app.use(le.middleware);

var server = require('http').createServer();
server.on('request', app);
server.listen(80, function () {
  console.log('Listening http', server.address());
});

var tlsServer = require('https').createServer({
  key: localCerts.key
, cert: localCerts.cert
, SNICallback: le.SNICallback
});
tlsServer.on('request', app);
tlsServer.listen(443, function () {
  console.log('Listening http', tlsServer.address());
});

le.register('certonly', {
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
