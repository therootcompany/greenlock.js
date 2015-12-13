letsencrypt
===========

Let's Encrypt for node.js

This allows you to get Free SSL Certificates for Automatic HTTPS.

NOT YET PUBLISHED
============

* Dec 12 2015: gettin' really close
* Dec 11 2015: almost done (node-letsencrypt-python complete)
* Dec 10 2015: began tinkering

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

Usage Examples
========

Here's a small snippet:

```javascript
le.register({
  domains: ['example.com', 'www.example.com']
, email: 'user@example.com'
, agreeTos: true
, webrootPath: '/srv/www/example.com/public'
}, function (err, certs) {
  // do stuff
});
```

**However**, due to the nature of what this library does, it has a few more "moving parts"
than what makes sense to show in a minimal snippet.

* [commandline (standalone with "webroot")](https://github.com/Daplie/node-letsencrypt/blob/master/examples/commandline.js)
* [expressjs (fully automatic https)](https://github.com/Daplie/node-letsencrypt/blob/master/examples/express.js)

See Also
========

* See [Examples](https://github.com/Daplie/node-letsencrypt/tree/master/examples)
* [Let's Encrypt in (exactly) 90 seconds with Caddy](https://daplie.com/articles/lets-encrypt-in-literally-90-seconds/)
* [lego](https://github.com/xenolf/lego): Let's Encrypt for golang 

API
===

* `LetsEncrypt.create(backend, bkDefaults, handlers)`
* `le.middleware()`
* `le.sniCallback(hostname, function (err, tlsContext) {})`
* `le.register({ domains, email, agreeTos, ... }, cb)`
* `le.fetch({domains, email, agreeTos, ... }, cb)`
* `le.validate(domains, cb)`

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

#### bkDefualts 

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
regesitration as `webrootPath` (which overwrites `defaults.webrootPath`).

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

Backends
--------

* [`letsencrypt-python`](https://github.com/Daplie/node-letsencrypt-python) (complete)
* [`lejs`](https://github.com/Daplie/node-lejs) (in progress)

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

LICENSE
=======

Dual-licensed MIT and Apache-2.0

See LICENSE
