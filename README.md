[![Join the chat at https://gitter.im/Daplie/letsencrypt-express](https://badges.gitter.im/Daplie/letsencrypt-express.svg)](https://gitter.im/Daplie/letsencrypt-express?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

| **letsencrypt** (library)
| [letsencrypt-cli](https://github.com/Daplie/letsencrypt-cli)
| [letsencrypt-express](https://github.com/Daplie/letsencrypt-express)
| [letsencrypt-koa](https://github.com/Daplie/letsencrypt-koa)
| [letsencrypt-hapi](https://github.com/Daplie/letsencrypt-hapi)
|

letsencrypt
===========

Automatic [Let's Encrypt](https://letsencrypt.org) HTTPS Certificates for node.js

  * [Automatic HTTPS with ExpressJS](https://github.com/Daplie/letsencrypt-express)
  * [Automatic live renewal](https://github.com/Daplie/letsencrypt-express#how-automatic)
  * On-the-fly HTTPS certificates for Dynamic DNS (in-process, no server restart)
  * Works with node cluster out of the box
  * usable [via commandline](https://github.com/Daplie/letsencrypt-cli) as well
  * Free SSL (HTTPS Certificates for TLS)
  * [90-day certificates](https://letsencrypt.org/2015/11/09/why-90-days.html)

**See Also**

* [Let's Encrypt in (exactly) 90 seconds with Caddy](https://daplie.com/articles/lets-encrypt-in-literally-90-seconds/)
* [lego](https://github.com/xenolf/lego): Let's Encrypt for golang

STOP
====

**These aren't the droids you're looking for.**

This is a low-level library for implementing CLIs,
system tools, and abstracting storage backends (file vs db, etc).
This is not the thing to use in your webserver directly.

### Use [letsencrypt-express](https://github.com/Daplie/letsencrypt-express) if...

you are planning to use one of these:

  * `express`
  * `connect`
  * raw `https`
  * raw `spdy`
  * `restify` (same as raw https)
  * `hapi` See [letsencrypt-hapi](https://github.com/Daplie/letsencrypt-hapi)
  * `koa` See [letsencrypt-koa](https://github.com/Daplie/letsencrypt-koa)
  * `rill` (similar to koa example)

### Use [letsencrypt-cli](https://github.com/Daplie/letsencrypt-cli) if...

You are planning to use one of these:

  * `bash`
  * `fish`
  * `zsh`
  * `cmd.exe`
  * `PowerShell`

Install
=======

```bash
npm install --save letsencrypt
```

Usage
=====

### letsencrypt

There are **NO DEFAULTS**.

A number of **constants** (such as LE.stagingServerUrl and LE.configDir)
are exported for your convenience, but all required options must be specified by the library invoking the call.

Open an issue if you need a variable for something that isn't there yet.

```javascript
var LE = require('letsencrypt');


var config = {
  server: LE.stagingServerUrl                               // or LE.productionServerUrl

, configDir: require('homedir')() + '/letsencrypt/etc'      // or /etc/letsencrypt or wherever

, privkeyPath: ':config/live/:hostname/privkey.pem'         //
, fullchainPath: ':config/live/:hostname/fullchain.pem'     // Note: both that :config and :hostname
, certPath: ':config/live/:hostname/cert.pem'               //       will be templated as expected
, chainPath: ':config/live/:hostname/chain.pem'             //

, debug: false
};


var handlers = {
  setChallenge: function (opts, hostname, key, val, cb) {}  // called during the ACME server handshake, before validation
, removeChallenge: function (opts, hostname, key, cb) {}    // called after validation on both success and failure
, getChallenge: function (opts, hostname, key, cb) {}       // this is special because it is called by the webserver
                                                            // (see letsencrypt-cli/bin & letsencrypt-express/standalone),
                                                            // not by the library itself

, agreeToTerms: function (tosUrl, cb) {}                    // gives you an async way to expose the legal agreement
                                                            // (terms of use) to your users before accepting
};


var le = LE.create(config, handlers);

                                                              // checks :conf/renewal/:hostname.conf
le.register({                                                 // and either renews or registers

  domains: ['example.com']                                    // CHANGE TO YOUR DOMAIN
, email: 'user@email.com'                                     // CHANGE TO YOUR EMAIL
, agreeTos: false                                             // set to true to automatically accept an agreement
                                                              // which you have pre-approved (not recommended)
}, function (err) {

  if (err) {
    // Note: you must have a webserver running
    // and expose handlers.getChallenge to it
    // in order to pass validation
    // See letsencrypt-cli and or letsencrypt-express
    console.error('[Error]: node-letsencrypt/examples/standalone');
    console.error(err.stack);
  } else {
    console.log('success');
  }
});
```

**However**, due to the nature of what this library does, it has a few more "moving parts"
than what makes sense to show in a minimal snippet.

API
===

```javascript
LetsEncrypt.create(leConfig, handlers, backend)           // wraps a given "backend" (the python or node client)
LetsEncrypt.stagingServer                                 // string of staging server for testing

le.middleware()                                           // middleware for serving webrootPath to /.well-known/acme-challenge
le.sniCallback(hostname, function (err, tlsContext) {})   // uses fetch (below) and formats for https.SNICallback
le.register({ domains, email, agreeTos, ... }, cb)        // registers or renews certs for a domain
le.fetch({domains, email, agreeTos, ... }, cb)            // fetches certs from in-memory cache, occasionally refreshes from disk
le.registrationFailureCallback(err, args, certInfo, cb)   // called when registration fails (not implemented yet)
```

### `LetsEncrypt.create(backend, leConfig, handlers)`

#### leConfig

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
registration as `webrootPath` (which overwrites `leConfig.webrootPath`).

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

### `le.fetch(args, cb)`

Used internally, but exposed for convenience.

Checks in-memory cache of certificates for `args.domains` and calls then calls `backend.fetch(args, cb)`
**after** merging `args` if necessary.

### `le.registrationFailureCallback(err, args, certInfo, cb)`

Not yet implemented


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

Change History
==============

* v1.5.0 now using letiny-core v2.0.0 and rsa-compat
* v1.4.x I can't remember... but it's better!
* v1.1.0 Added letiny-core, removed node-letsencrypt-python
* v1.0.2 Works with node-letsencrypt-python
* v1.0.0 Thar be dragons

LICENSE
=======

Dual-licensed MIT and Apache-2.0

See LICENSE
