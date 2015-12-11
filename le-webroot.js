'use strict';

cacheIpAddresses

var https = require('https');
var http = require('http');
var letsencrypt = require('letsencrypt');
var localCerts = require('localhost.daplie.com-certificates');
var insecureServer;
var server;

letsencrypt.create(
  '/home/user/.local/share/letsencrypt/bin/letsencrypt'
  // set some defaults
, { "": ""
  }
).then(function (le) {

  var express = require('express');
  var app = express();
  var getSecureContext = require('./le-standalone').getSecureContext;

  insecureServer = http.createServer();
  localCerts.sniCallback = function (hostname, cb) {
    getSecureContext(le, hostname, cb);
  };
  server = https.createServer(localCerts);

  insecureServer.on('request', app);

  server.on('request', app);
});

insecureServer.listen(80, function () {
  console.log('http server listening', insecureServer.address());
});

server.listen(443, function () {
  console.log('https server listening', server.address());
});
