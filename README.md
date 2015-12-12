letsencrypt
===========

Let's Encrypt for node.js

This allows you to get Free SSL Certificates for Automatic HTTPS.

NOT YET PUBLISHED
============

Dec 12 2015: gettin' really close
Dec 11 2015: almost done

Install
=======

```bash
npm install --save letsencrypt
```

Right now this uses [`letsencrypt-python`](https://github.com/Daplie/node-letsencrypt-python),
but it's built to be able to use a pure javasript version.

```bash
# install the python client (takes 2 minutes normally, 20 on a rasberry pi)
git clone https://github.com/letsencrypt/letsencrypt
pushd letsencrypt

./letsencrypt-auto
```

Usage
=====

```javascript
var leBinPath = '/home/user/.local/share/letsencrypt/bin/letsencrypt';
var lep = require('letsencrypt-python').create(leBinPath);

// backend-specific defaults
// Note: For legal reasons you should NOT set email or agreeTos as a default
var bkDefaults = {
  webroot: true
, webrootPath: __dirname, '/acme-challenge'
, fullchainTpl: '/live/:hostname/fullchain.pem'
, privkeyTpl: '/live/:hostname/fullchain.pem'
, configDir: '/etc/letsencrypt'
, logsDir: '/var/log/letsencrypt'
, workDir: '/var/lib/letsencrypt'
, text: true
};
var leConfig = {
, webrootPath: __dirname, '/acme-challenge'
, configDir: '/etc/letsencrypt'
};
var le = require('letsencrypt').create(le, bkDefaults, leConfig);

var localCerts = require('localhost.daplie.com-certificates');
var express = require('express');
var app = express();

app.use(le.middleware);

server = require('http').createServer();
server.on('request', app);
server.listen(80, function () {
  console.log('Listening http', server.address());
});

tlsServer = require('https').createServer({
  key: localCerts.key
, cert: localCerts.cert
, SNICallback: le.SNICallback
});
tlsServer.on('request', app);
tlsServer.listen(443, function () {
  console.log('Listening http', server.address());
});

le.register('certonly', {
, domains: ['example.com']
, agreeTos: true
, email: 'user@example.com'
}).then(function () {
  server.close();
  tlsServer.close();
});
```

```
lep.register('certonly', {
, domains: ['example.com']
, agreeTos: true
, email: 'user@example.com'

, configDir: '/etc/letsencrypt'
, logsDir: '/var/log/letsencrypt'
, workDir: '/var/lib/letsencrypt'
, text: true
});
```

```
// if you would like to register new domains on-the-fly
// you can use this function to return the user to which
// it should be registered (or null if none)
, needsRegistration: function (hostname, cb) {
    cb(null, {
      agreeTos: true
    , email:  'user@example.com'
    });
  }
```

Backends
--------

* [`letsencrypt-python`](https://github.com/Daplie/node-letsencrypt-python) (complete)
* [`lejs`](https://github.com/Daplie/node-lejs) (in progress)

#### How to write a backend

A backend must implement (or be wrapped to implement) this API:

* fetch(hostname, cb) will cb(err, certs) will get registered certs or null unless there is an error
* register(args, challengeCb, done) will register and or renew a cert
  * args = `{ domains, email, agreeTos }` MUST check that agreeTos === true
  * challengeCb = `function (challenge, cb) { }` handle challenge as needed, call cb()

This is what `args` looks like:

```javascript
{ domains: ['example.com', 'www.example.com']
, email: 'user@email.com'
, agreeTos: true
, configDir: '/etc/letsencrypt'
, fullchainTpl: '/live/:hostname/fullchain.pem'  // :hostname will be replaced with the domainname
, privkeyTpl: '/live/:hostname/privkey.pem'    // :hostname
}
```

This is what the implementation should look like:

(it's expected that the client will follow the same conventions as
the python client, but it's not necessary)

```javascript
return {
  fetch: function (args, cb) {
    // NOTE: should return an error if args.domains cannot be satisfied with a single cert
    // (usually example.com and www.example.com will be handled on the same cert, for example)
    if (errorHappens) {
      // return an error if there is an actual error (db, etc)
      cb(err);
      return;
    }
    // return null if there is no error, nor a certificate
    else if (!cert) {
      cb(null, null);
      return;
    }

    // NOTE: if the certificate is available but expired it should be
    // returned and the calling application will decide to renew when
    // it is convenient

    // NOTE: the application should handle caching, not the library

    // return the cert with metadata
    cb(null, {
      cert: "/*contcatonated certs in pem format: cert + intermediate*/"
    , key: "/*private keypair in pem format*/"
    , renewedAt: new Date()       // fs.stat cert.pem should also work
    , expiresIn: 90 * 60          // assumes 90-days unless specified
    });
  }
, register: function (args, challengeCallback, completeCallback) {
    // **MUST** reject if args.agreeTos is not true

    // once you're ready for the caller to know the challenge
    if (challengeCallback) {
      challengeCallback(challenge, function () {
        continueRegistration();
      })
    } else {
      continueRegistration();
    }

    function continueRegistration() {
      // it is not neccessary to to return the certificates here
      // the client will call fetch() when it needs them
      completeCallback(err);
    }
  }
};
```

See Also
========

* [Let's Encrypt in (exactly) 90 seconds with Caddy](https://daplie.com/articles/lets-encrypt-in-literally-90-seconds/)
* Let's Encrypt for golang [lego](https://github.com/xenolf/lego)


LICENSE
=======

Dual-licensed MIT and Apache-2.0

See LICENSE
