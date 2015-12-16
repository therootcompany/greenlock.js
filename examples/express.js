'use strict';

var conf = {
  domains: (process.argv[2]||'').split(',')
, email: process.argv[3]
, agree: 'agree' === process.argv[4]
};
var port = 80;
var tlsPort = 5001;

if (!conf.domains || !conf.email || !conf.agree) {
  console.error("Usage: node examples/express <domain1,domain2> <email> agree");
  console.error("Example: node examples/express example.com,www.example.com user@example.com agree");
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
};

var le = LE.create(LEP, bkDefaults, {
  sniRegisterCallback: function (args, certInfo, cb) {
    var allowedDomains = conf.domains; // require('../tests/config').allowedDomains;

    // let the renewal take place in the background
    if (certInfo && certInfo.context) {
      cb(null, certInfo);
      return;
    }

    // verify that these are domains we allow to register on our server
    if (args.domains.length && args.domains.every(function (hostname) {
      hostname = hostname.toLowerCase();
      return (-1 !== allowedDomains.indexOf(hostname));
    })) {
      // wait for registration before responding
      args.agreeTos = conf.agree;
      args.email = conf.email; // you'd want to lookup which user has this email
      le.register(args, cb);
    } else {
      // I don't know where this error goes (SNICallback)... but at least we put it somewhere
      cb(new Error("SNI came in for (an) unrecognized domain(s): '" + args.domains + "'"));
    }
  }
/*
, setChallenge: function (hostnames, key, value, cb) {
    // the python backend needs fs.watch implemented
    // before this would work (and even then it would be difficult)
  }
, getChallenge: function (hostnames, key, cb) {
    //
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
