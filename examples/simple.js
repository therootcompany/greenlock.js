'use strict';

//var Greenlock = require('greenlock');
var Greenlock = require('../');
var db = {};

var config = {
  server: 'https://acme-v02.api.letsencrypt.org/directory'
, version: 'draft-11'

, configDir: require('os').homedir() + '/acme/etc'          // or /etc/acme or wherever

, privkeyPath: ':config/live/:hostname/privkey.pem'         //
, fullchainPath: ':config/live/:hostname/fullchain.pem'     // Note: both that :config and :hostname
, certPath: ':config/live/:hostname/cert.pem'               //       will be templated as expected
, chainPath: ':config/live/:hostname/chain.pem'             //

, rsaKeySize: 2048

, debug: true
};

var handlers = {
  setChallenge: function (opts, hostname, key, val, cb) {   // called during the ACME server handshake, before validation
    db[key] = {
      hostname: hostname
    , key: key
    , val: val
    };

    cb(null);
  }
, removeChallenge: function (opts, hostname, key, cb) {     // called after validation on both success and failure
    db[key] = null;
    cb(null);
  }
, getChallenge: function (opts, hostname, key, cb) {        // this is special because it is called by the webserver
    cb(null, db[key].val);                                  // (see greenlock-cli/bin & greenlock-express/standalone),
                                                            // not by the library itself
  }
, agreeToTerms: function (tosUrl, cb) {                     // gives you an async way to expose the legal agreement
    cb(null, tosUrl);                                       // (terms of use) to your users before accepting
  }
};

var greenlock = Greenlock.create(config, handlers);
console.error("CHANGE THE EMAIL, DOMAINS, AND AGREE TOS IN THE EXAMPLE BEFORE RUNNING IT");
process.exit(1);
                                                            // checks :conf/renewal/:hostname.conf
greenlock.register({                                        // and either renews or registers
  domains: ['example.com']                                  // CHANGE TO YOUR DOMAIN
, email: 'user@email.com'                                   // CHANGE TO YOUR EMAIL
, agreeTos: false                                           // set to true to automatically accept an agreement
                                                            // which you have pre-approved (not recommended)
, rsaKeySize: 2048
}, function (err) {
  if (err) {
    // Note: you must have a webserver running
    // and expose handlers.getChallenge to it
    // in order to pass validation
    // See greenlock-cli and or greenlock-express
    console.error('[Error]: greenlock/examples/standalone');
    console.error(err.stack);
  } else {
    console.log('success');
  }
});
