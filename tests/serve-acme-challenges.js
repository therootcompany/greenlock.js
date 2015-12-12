'use strict';

var fs = require('fs');
var path = require('path');
var https = require('https');
var http = require('http');
var express = require('express');
var app = express();

var config = require('./config');


function getSecureContext(domainname, opts, cb) {
  var letsetc = '/etc/letsencrypt/live/';

  if (!opts) { opts = {}; }

  opts.key = fs.readFileSync(path.join(letsetc, domainname, 'privkey.pem'));
  opts.cert = fs.readFileSync(path.join(letsetc, domainname, 'cert.pem'));
  opts.ca = fs.readFileSync(path.join(letsetc, domainname, 'chain.pem'), 'ascii')
    .split('-----END CERTIFICATE-----')
    .filter(function (ca) {
      return ca.trim();
    }).map(function (ca) {
      return (ca + '-----END CERTIFICATE-----').trim();
    });

  cb(null, require('tls').createSecureContext(opts));
}


// log the requests
app.use('/', function (req, res, next) {
  console.log('[' + req.ip + ']', req.method + ' ' + req.headers.host, req.protocol + req.url);
  next();
});
// handle static requests to /.well-known/acme-challenge
app.use(
  '/.well-known/acme-challenge'
, express.static(config.webrootPath, { dotfiles: undefined })
);


function serveHttps() {
  //
  // SSL Certificates
  //
  var server;
  var localCerts = require('localhost.daplie.com-certificates');
  var options = {
    requestCert: false
  , rejectUnauthorized: true

    // If you need to use SNICallback you should be using io.js >= 1.x (possibly node >= 0.12)
  , SNICallback: function (domainname, cb) {
      var secureContext = getSecureContext(domainname);
      cb(null, secureContext);
    }
    // If you need to support HTTP2 this is what you need to work with
  //, NPNProtocols: ['http/2.0', 'http/1.1', 'http/1.0']
  //, NPNProtocols: ['http/1.1']
  , key: localCerts.key
  , cert: localCerts.cert
  //, ca: null
  };

  // Start the tls sni server4
  server = https.createServer(options);
  server.on('error', function (err) {
    console.error(err);
  });
  server.on('request', app);
  server.listen(config.tlsSni01Port, function () {
    console.log('[https] Listening', server.address());
  });
}

function serveHttp() {
  // Start the http server4
  var insecureServer = http.createServer();
  insecureServer.on('error', function (err) {
    console.error(err);
  });
  // note that request handler must be attached *before* and handle comes in
  insecureServer.on('request', app);
  insecureServer.listen(config.http01Port, function () {
    console.log('[http] Listening', insecureServer.address());
  });
}


serveHttps();
serveHttp();
