'use strict';

var fs = require('fs');
var path = require('path');
var localCerts = require('localhost.daplie.com-certificates');
var https = require('https');
var http = require('http');
var express = require('express');
var app = express();
var server;
var insecureServer;

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


//
// SSL Certificates
//
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
, key: null
, cert: null
//, ca: null
};
options.key = localCerts.key;
options.cert = localCerts.cert;


// log the requests
app.use('/', function (req, res, next) {
  console.log(req.method + ' ' + req.headers['host'], req.protocol + req.url);
});
// handle static requests to /.well-known/acme-challenge
app.use(
  '/.well-known/acme-challenge'
, express.static(path.join(__dirname, 'acme-challenge'), { dotfiles: undefined })
);


// Start the tls sni server
server = https.createServer(options);
server.on('error', function (err) {
  console.error(err);
});
server.listen(config.tlsSni01Port, function () {
  console.log('Listening');
});
server.on('request', app);

// Start the http server
insecureServer = http.createServer();
insecureServer.on('error', function (err) {
  console.error(err);
});
insecureServer.listen(config.http01Port, function () {
  console.log('Listening');
});
insecureServer.on('request', app);
