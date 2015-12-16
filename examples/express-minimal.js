'use strict';

var LE = require('../');
var config = require('./config-minimal');

// Note: you should make this special dir in your product and leave it empty
config.le.webrootPath = __dirname + '/../tests/acme-challenge';
config.le.server = LE.stagingServer;

var le = LE.create(config.le, {
  sniRegisterCallback: function (args, expiredCert, cb) {
    // In theory you should never get an expired certificate because
    // the certificates automatically renew in the background starting
    // about a week before they expire.
    // (the default behavior is to randomly stagger renewals)
    // so in this case we'll just return the expired certificate
    if (expiredCert) { return cb(null, expiredCert); }

    // If we get here that means this domain hasn't been registered yet
    // Security Warning: you should either manually register domains
    // and return null here or check that the sni header isn't being
    // spoofed and this is actually a domain you own before registering
    //
    //   cb(null, null);

    var hostname = args.domains[0];
    console.log("[TODO] check that '" + hostname + "' is one I expect");

    args.agreeTos = true;
    args.email = 'user@example.com';

    le.register(args, cb);
  }
});


//
// Express App
//
var app = require('express')();
app.use('/', le.middleware());


//
// HTTP & HTTPS servers
//
require('http').createServer(app).listen(config.plainPort, function () {
  console.log('Listening http', this.address());
});

require('https').createServer({
  key: config.tlsKey
, cert: config.tlsCert
, SNICallback: le.sniCallback
}, app).listen(config.tlsPort, function () {
  console.log('Listening http', this.address());
});
