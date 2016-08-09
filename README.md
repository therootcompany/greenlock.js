[![Join the chat at https://gitter.im/Daplie/letsencrypt-express](https://badges.gitter.im/Daplie/letsencrypt-express.svg)](https://gitter.im/Daplie/letsencrypt-express?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

| **letsencrypt** (library)
| [letsencrypt-cli](https://github.com/Daplie/letsencrypt-cli)
| [letsencrypt-express](https://github.com/Daplie/letsencrypt-express)
| [letsencrypt-koa](https://github.com/Daplie/letsencrypt-koa)
| [letsencrypt-hapi](https://github.com/Daplie/letsencrypt-hapi)
|

letsencrypt
===========

Automatic [Let's Encrypt](https://letsencrypt.org) HTTPS / TLS / SSL Certificates for node.js

Free SLL with [90-day](https://letsencrypt.org/2015/11/09/why-90-days.html) HTTPS / TLS Certificates

STOP
====

> **These aren't the droids you're looking for.**

This is a **low-level library** for implementing ACME / LetsEncrypt Clients, CLIs,
system tools, and abstracting storage backends (file vs db, etc).

For `express`, raw `https` or `spdy`, or `restify` (same as raw https) see
[**letsencrypt-express**](https://github.com/Daplie/letsencrypt-express).

For `hapi` see [letsencrypt-hapi](https://github.com/Daplie/letsencrypt-hapi).

For `koa` or `rill`
see [letsencrypt-koa](https://github.com/Daplie/letsencrypt-koa).

For `bash`, `fish`, `zsh`, `cmd.exe`, `PowerShell`
see [**letsencrypt-cli**](https://github.com/Daplie/letsencrypt-cli).

CONTINUE
========

If you're sure you're at the right place, here's what you need to know now:

Install
-------

`letsencrypt` requires at least two plugins:
one for managing certificate storage and the other for handling ACME challenges.

The default storage plugin is [`le-store-certbot`](https://github.com/Daplie/le-store-certbot)
and the default challenge is [`le-challenge-fs`](https://github.com/Daplie/le-challenge-fs).

```bash
npm install --save letsencrypt@2.x
npm install --save le-store-certbot@2.x
npm install --save le-challenge-fs@2.x
```

Usage
-----

It's very simple and easy to use, but also very complete and easy to extend and customize.

### Overly Simplified Example

Against my better judgement I'm providing a terribly oversimplified example
of how to use this library:

```javascript
var le = require('letsencrypt').create({ server: 'staging' });

le.register(
  { domains: ['example.com'], email: 'user@email.com', agreeTos: true }
, function (err, results) {
    console.log(err, results);
  }
);
```

You also need some sort of server to handle the acme challenge:

```javascript
var app = express();
app.use('/', le.middleware());
```

Note: The `webrootPath` string is a template.
Any occurance of `:hostname` will be replaced
with the domain for which we are requested certificates.

### Useful Example

The configuration consists of 3 components:

* Storage Backend (search npm for projects starting with 'le-store-')
* ACME Challenge Handlers (search npm for projects starting with 'le-challenge-')
* Letsencryt Config (this is all you)

```javascript
'use strict';

var LE = require('letsencrypt');
var le;


// Storage Backend
var leStore = require('le-store-certbot').create({
  configDir: '~/letsencrypt/etc'                          // or /etc/letsencrypt or wherever
, debug: false
});


// ACME Challenge Handlers
var leChallenge = require('le-challenge-fs').create({
  webrootPath: '~/letsencrypt/var/'                       // or template string such as
, debug: false                                            // '/srv/www/:hostname/.well-known/acme-challenge'
});


function leAgree(opts, agreeCb) {
  // opts = { email, domains, tosUrl }
  agreeCb(null, opts.tosUrl);
}

le = LE.create({
  server: LE.stagingServerUrl                             // or LE.productionServerUrl
, store: leStore                                          // handles saving of config, accounts, and certificates
, challenge: leChallenge                                  // handles /.well-known/acme-challege keys and tokens
, agreeToTerms: leAgree                                   // hook to allow user to view and accept LE TOS
, debug: false
});


// If using express you should use the middleware
// app.use('/', le.middleware());
//
// Otherwise you should see the test file for usage of this:
// le.challenge.get(opts.domain, key, val, done)



// Check in-memory cache of certificates for the named domain
le.check({ domains: [ 'example.com' ] }).then(function (results) {
  if (results) {
    // we already have certificates
    return;
  }


  // Register Certificate manually
  le.register({

    domains: ['example.com']                                // CHANGE TO YOUR DOMAIN (list for SANS)
  , email: 'user@email.com'                                 // CHANGE TO YOUR EMAIL
  , agreeTos: ''                                            // set to tosUrl string (or true) to pre-approve (and skip agreeToTerms)
  , rsaKeySize: 2048                                        // 2048 or higher
  , challengeType: 'http-01'                                // http-01, tls-sni-01, or dns-01

  }).then(function (results) {

    console.log('success');

  }, function (err) {

    // Note: you must either use le.middleware() with express,
    // manually use le.challenge.get(opts, domain, key, val, done)
    // or have a webserver running and responding
    // to /.well-known/acme-challenge at `webrootPath`
    console.error('[Error]: node-letsencrypt/examples/standalone');
    console.error(err.stack);

  });

});
```

Here's what `results` looks like:

```javascript
{ privkey: ''     // PEM encoded private key
, cert: ''        // PEM encoded cert
, chain: ''       // PEM encoded intermediate cert
, fullchain: ''   // cert + chain
, issuedAt: 0     // notBefore date (in ms) parsed from cert
, expiresAt: 0    // notAfter date (in ms) parsed from cert
}
```

API
---

The full end-user API is exposed in the example above and includes all relevant options.

```
le.register
le.check
```

### Helper Functions

We do expose a few helper functions:

* LE.validDomain(hostname) // returns '' or the hostname string if it's a valid ascii or punycode domain name

TODO fetch domain tld list

### Template Strings

The following variables will be tempalted in any strings passed to the options object:

* `~/` replaced with `os.homedir()` i.e. `/Users/aj`
* `:hostname` replaced with the first domain in the list i.e. `example.com`

Developer API
-------------

If you are developing an `le-store-*` or `le-challenge-*` plugin you need to be aware of
additional internal API expectations.

**IMPORTANT**:

Use `v2.0.0` as your initial version - NOT v0.1.0 and NOT v1.0.0 and NOT v3.0.0.
This is to indicate that your module is compatible with v2.x of node-letsencrypt.

Since the public API for your module is defined by node-letsencrypt the major version
should be kept in sync.

### store implementation

TODO double check and finish

* accounts
  * accounts.byDomain
  * accounts.all
  * accounts.get
  * accounts.exists
* certs
  * certs.byAccount
  * certs.all
  * certs.get
  * certs.exists

### challenge implementation

TODO finish

* `.set(opts, domain, key, value, done);`         // opts will be saved with domain/key
* `.get(opts, domain, key, done);`                // opts will be retrieved by domain/key
* `.remove(opts, domain, key, done);`             // opts will be retrieved by domain/key

Change History
==============

* v2.0.0 - Aug 5th 2016
  * major refactor
  * simplified API
  * modular pluigns
  * knock out bugs
* v1.5.0 now using letiny-core v2.0.0 and rsa-compat
* v1.4.x I can't remember... but it's better!
* v1.1.0 Added letiny-core, removed node-letsencrypt-python
* v1.0.2 Works with node-letsencrypt-python
* v1.0.0 Thar be dragons

LICENSE
=======

Dual-licensed MIT and Apache-2.0

See LICENSE
