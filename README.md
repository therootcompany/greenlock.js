letsencrypt
===========

Automatic [Let's Encrypt](https://lettsencrypt.org) HTTPS Certificates for node.js

  * Automatic HTTPS with ExpressJS
  * Automatic live renewal (in-process)
  * On-the-fly HTTPS certificates for Dynamic DNS (in-process, no server restart)
  * Works with node cluster out of the box
  * usable via commandline as well
  * Free SSL (HTTPS Certificates for TLS)
  * [90-day certificates](https://letsencrypt.org/2015/11/09/why-90-days.html)

**See Also**

* See the node-letsencrypt [Examples](https://github.com/Daplie/node-letsencrypt/tree/master/examples)
* [Let's Encrypt in (exactly) 90 seconds with Caddy](https://daplie.com/articles/lets-encrypt-in-literally-90-seconds/)
* [lego](https://github.com/xenolf/lego): Let's Encrypt for golang

Install
=======

```bash
npm install --save letsencrypt
```

Right now this uses [`letsencrypt-python`](https://github.com/Daplie/node-letsencrypt-python),
but it's built to be able to use a node-only javascript version (in progress).

```bash
# install the python client (takes 2 minutes normally, 20 on a raspberry pi)
git clone https://github.com/letsencrypt/letsencrypt
pushd letsencrypt

./letsencrypt-auto
```

**moving towards a python-free version**

There are a few partially written javascript implementation, but they use `forge` instead of using node's native `crypto` and `ursa` - so their performance is outright horrific (especially on Raspberry Pi et al). For the moment it's faster to use the wrapped python version.

Once the `forge` crud is gutted away it should slide right in without a problem. Ping [@coolaj86](https://coolaj86.com) if you'd like to help.

Usage
=====

Here's a simple snippet:

```javascript
var config = require('./examples/config-minimal');

config.le.webrootPath = __dirname + './tests/acme-challenge';

var le = require('letsencrypt').create(config.backend, config.le);
le.register({
  agreeTos: true
, domains: ['example.com']          // CHANGE TO YOUR DOMAIN
, email: 'user@email.com'           // CHANGE TO YOUR EMAIL
}, function (err) {
  if (err) {
    console.error('[Error]: node-letsencrypt/examples/standalone');
    console.error(err.stack);
  } else {
    console.log('success');
  }

  plainServer.close();
  tlsServer.close();
});

// IMPORTANT
// you also need BOTH an http AND https server that serve directly
// from webrootPath, which might as well be a special folder reserved
// only for acme/letsencrypt challenges
//
// app.use('/', express.static(config.le.webrootPath))
```

**However**, due to the nature of what this library does, it has a few more "moving parts"
than what makes sense to show in a minimal snippet.

Examples
========

### One-Time Registration

Register a 90-day certificate manually, on a whim

#### Snippets

[`commandline-minimal`](https://github.com/Daplie/node-letsencrypt/blob/master/examples/commandline-minimal.js):

**Part 1: the Let's Encrypt client**:
```javascript
'use strict';

var LE = require('letsencrypt');
var config = require('./config-minimal');

// Note: you should make this special dir in your product and leave it empty
config.le.webrootPath = __dirname + '/../tests/acme-challenge';
config.le.server = LE.stagingServer;


//
// Manual Registration
//
var le = LE.create(config.backend, config.le);
le.register({
  agreeTos: true
, domains: ['example.com']          // CHANGE TO YOUR DOMAIN
, email: 'user@email.com'           // CHANGE TO YOUR EMAIL
}, function (err) {
  if (err) {
    console.error('[Error]: node-letsencrypt/examples/standalone');
    console.error(err.stack);
  } else {
    console.log('success');
  }

  plainServer.close();
  tlsServer.close();
});
```

**Part 2: Express Web Server**:
```javascript
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
```

#### Runnable Demo

* [commandline (standalone with "webroot")](https://github.com/Daplie/node-letsencrypt/blob/master/examples/commandline.js)

```bash
# manual standalone registration via commandline
# (runs against testing server on tls port 5001)
node examples/commandline.js example.com,www.example.com user@example.net agree
```

### Express

Fully Automatic HTTPS with ExpressJS using Free SSL certificates from Let's Encrypt

#### Snippets

* [Minimal ExpressJS Example](https://github.com/Daplie/node-letsencrypt/blob/master/examples/express-minimal.js)

```javascript
'use strict';

var LE = require('letsencrypt');
var config = require('./config-minimal');

// Note: you should make this special dir in your product and leave it empty
config.le.webrootPath = __dirname + '/../tests/acme-challenge';
config.le.server = LE.stagingServer;

//
// Automatically Register / Renew Domains
//
var le = LE.create(config.backend, config.le, {
  sniRegisterCallback: function (args, expiredCert, cb) {
    // Security: check that this is actually a subdomain we allow
    // (otherwise an attacker can cause you to rate limit against the LE server)

    var hostname = args.domains[0];
    if (!/\.example\.com$/.test(hostname)) {
      console.error("bad domain '" + hostname + "', not a subdomain of example.com");
      cb(nul, null);
    }

    // agree to the LE TOS for this domain
    args.agreeTos = true;
    args.email = 'user@example.com';

    // use the cert even though it's expired
    if (expiredCert) {
      cb(null, expiredCert);
      cb = function () { /*ignore*/ };
    }

    // register / renew the certificate in the background
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
```

#### Runnable Example

* [Full ExpressJS Example](https://github.com/Daplie/node-letsencrypt/blob/master/examples/express.js)

```bash
# clear out the certificates
rm -rf tests/letsencrypt.*

# automatic registration and renewal (certs install as you visit the site for the first time)
# (runs against testing server on tls port 5001)
node examples/express.js example.com,www.example.com user@example.net agree
```

```bash
# this will take a moment because it won't respond to the tls sni header until it gets the certs
curl https://example.com/
```

### non-root

If you want to run this as non-root, you can.

You just have to set node to be allowed to use root ports

```
# node
sudo setcap cap_net_bind_service=+ep /usr/local/bin/node
```

and then make sure to set all of of the following to a directory that your user is permitted to write to

* `webrootPath`
* `configDir`
* `workDir` (python backend only)
* `logsDir` (python backend only)


API
===

```javascript
LetsEncrypt.create(backend, bkDefaults, handlers)          // wraps a given "backend" (the python client)
LetsEncrypt.stagingServer                                  // string of staging server for testing

le.middleware()                                            // middleware for serving webrootPath to /.well-known/acme-challenge
le.sniCallback(hostname, function (err, tlsContext) {})    // uses fetch (below) and formats for https.SNICallback
le.register({ domains, email, agreeTos, ... }, cb)         // registers or renews certs for a domain
le.fetch({domains, email, agreeTos, ... }, cb)             // fetches certs from in-memory cache, occasionally refreshes from disk
le.validate(domains, cb)                                   // do some sanity checks before attempting to register
le.registrationFailureCallback(err, args, certInfo, cb)    // called when registration fails (not implemented yet)
```

### `LetsEncrypt.create(backend, bkDefaults, handlers)`

#### backend

Currently only `letsencrypt-python` is supported, but we plan to work on
native javascript support in February or so (when ECDSA keys are available).

If you'd like to help with that, see **how to write a backend** below and also
look at the wrapper `backend-python.js`.

**Example**:
```javascript
{ fetch: function (args, cb) {
    // cb(err) when there is an actual error (db, fs, etc)
    // cb(null, null) when the certificate was NOT available on disk
    // cb(null, { cert: '<fullchain.pem>', key: '<privkey.pem>', renewedAt: 0, duration: 0 }) cert + meta
  }
, register: function (args, setChallenge, cb) {
    // setChallenge(hostnames, key, value, cb) when a challenge needs to be set
    // cb(err) when there is an error
    // cb(null, null) when the registration is successful, but fetch still needs to be called
    // cb(null, cert /*see above*/) if registration can easily return the same as fetch
  }
}
```

#### bkDefaults

The arguments passed here (typically `webpathRoot`, `configDir`, etc) will be merged with
any `args` (typically `domains`, `email`, and `agreeTos`) and passed to the backend whenever
it is called.

Typically the backend wrapper will already merge any necessary backend-specific arguments.

**Example**:
```javascript
{ webrootPath: __dirname, '/acme-challenge'
, fullchainTpl: '/live/:hostname/fullchain.pem'
, privkeyTpl: '/live/:hostname/fullchain.pem'
, configDir: '/etc/letsencrypt'
}
```

Note: `webrootPath` can be set as a default, semi-locally with `webrootPathTpl`, or per
registration as `webrootPath` (which overwrites `defaults.webrootPath`).

#### handlers *optional*

`h.setChallenge(hostnames, name, value, cb)`:

default is to write to fs

`h.getChallenge(hostnames, value cb)`

default is to read from fs

`h.sniRegisterCallback(args, currentCerts, cb)`

The default is to immediately call `cb(null, null)` and register (or renew) in the background
during the `SNICallback` phase. Right now it isn't reasonable to renew during SNICallback,
but around February when it is possible to use ECDSA keys (as opposed to RSA at present),
registration will take very little time.

This will not be called while another registration is already in progress.

**SECURITY WARNING**: If you use this option with a custom `h.validate()`, make sure that `args.domains`
refers to domains you expect, otherwise an attacker will spoof SNI and cause your server to rate-limit
letsencrypt.org and get blocked. Note that `le.validate()` will check A records before attempting to
register to help prevent such possible attacks.

`h.validate(domains, cb)`

When specified this will override `le.validate()`. You will need to do this if the ip address of this
server is not one specified in the A records for your domain.

### `le.middleware()`

An express handler for `/.well-known/acme-challenge/<challenge>`.
Will call `getChallenge([hostname], key, cb)` if present or otherwise read `challenge` from disk.

Example:
```javascript
app.use('/', le.middleware())
```

### `le.sniCallback(hostname, function (err, tlsContext) {});`

Will call `fetch`. If fetch does not return certificates or returns expired certificates
it will call `sniRegisterCallback(args, currentCerts, cb)` and then return the error,
the new certificates, or call `fetch` a final time.

Example:
```javascript
var server = require('https').createServer({ SNICallback: le.sniCallback, cert: '...', key: '...' });
server.on('request', app);
```

### `le.register({ domains, email, agreeTos, ... }, cb)`

Get certificates for a domain

Example:
```javascript
le.register({
  domains: ['example.com', 'www.example.com']
, email: 'user@example.com'
, webrootPath: '/srv/www/example.com/public'
, agreeTos: true
}, function (err, certs) {
  // err is some error

  console.log(certs);
  /*
  { cert: "contents of fullchain.pem"
  , key: "contents of privkey.pem"
  , renewedAt: <date in milliseconds>
  , duration: <duration in milliseconds (90-days)>
  }
  */
});
```

### `le.isValidDomain(hostname)`

returns `true` if `hostname` is a valid ascii or punycode domain name.

(also exposed on the main exported module as `LetsEncrypt.isValidDomain()`)

### `le.validate(args, cb)`

Used internally, but exposed for convenience. Checks `LetsEncrypt.isValidDomain()`
and then checks to see that the current server

Called before `backend.register()` to validate the following:

  * the hostnames don't use any illegal characters
  * the server's actual public ip (via api.apiify.org)
  * the A records for said hostnames

### `le.fetch(args, cb)`

Used internally, but exposed for convenience.

Checks in-memory cache of certificates for `args.domains` and calls then calls `backend.fetch(args, cb)`
**after** merging `args` if necessary.

### `le.registrationFailureCallback(err, args, certInfo, cb)`

Not yet implemented

Backends
--------

* [`letsencrypt-python`](https://github.com/Daplie/node-letsencrypt-python) (complete)
* [`letiny`](https://github.com/Daplie/node-letiny) (in progress)

#### How to write a backend

A backend must implement (or be wrapped to implement) this API:

* `fetch(hostname, cb)` will cb(err, certs) with certs from disk (or null or error)
* `register(args, challengeCb, done)` will register and or renew a cert
  * args = `{ domains, email, agreeTos }` MUST check that agreeTos === true
  * challengeCb = `function (challenge, cb) { }` handle challenge as needed, call cb()

This is what `args` looks like:

```javascript
{ domains: ['example.com', 'www.example.com']
, email: 'user@email.com'
, agreeTos: true
, configDir: '/etc/letsencrypt'
, fullchainTpl: '/live/:hostname/fullchain.pem'  // :hostname will be replaced with the domainname
, privkeyTpl: '/live/:hostname/privkey.pem'
, webrootPathTpl: '/srv/www/:hostname/public'
, webrootPath: '/srv/www/example.com/public'    // templated from webrootPathTpl
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
    , duration: 90 * 24 * 60 * 60 * 1000  // assumes 90-days unless specified
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
      // it is not necessary to to return the certificates here
      // the client will call fetch() when it needs them
      completeCallback(err);
    }
  }
};
```

Change History
==============

v1.0.0 Thar be dragons

LICENSE
=======

Dual-licensed MIT and Apache-2.0

See LICENSE
