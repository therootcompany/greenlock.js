'use strict';

var LE = require('../');
var config = require('./config-minimal');

// Note: you should make this special dir in your product and leave it empty
config.le.webrootPath = __dirname + '/../tests/acme-challenge';
config.le.server = LE.stagingServer;


//
// Manual Registration
//
var le = LE.create(config.le);
le.backend.registerAsync({
  agreeTos: true
, domains: ['example.com']            // CHANGE TO YOUR DOMAIN
, email: 'user@example.com'           // CHANGE TO YOUR EMAIL
}, function (err, body) {
  if (err) {
    console.error('[Error]: node-letsencrypt/examples/ursa');
    console.error(err.stack);
  } else {
    console.log('success', body);
  }

  plainServer.close();
  tlsServer.close();
}).then(function () {}, function (err) {
  console.error(err.stack);
});

//
// Express App
//
var app = require('express')();
app.use('/', le.middleware());


//
// HTTP & HTTPS servers
// (required for domain validation)
//
var plainServer = require('http').createServer(app).listen(config.plainPort, function () {
  console.log('Listening http', this.address());
});

var tlsServer = require('https').createServer({
  key: config.tlsKey
, cert: config.tlsCert
, SNICallback: le.sniCallback
}, app).listen(config.tlsPort, function () {
  console.log('Listening http', this.address());
});
