!["Greenlock Logo"](https://git.coolaj86.com/coolaj86/greenlock.js/raw/branch/master/logo/greenlock-1063x250.png "Greenlock lock logo and work mark")

!["Greenlock Function"](https://git.coolaj86.com/coolaj86/greenlock.js/raw/branch/master/logo/from-not-secure-to-secure-url-bar.png "from url bar showing not secure to url bar showing secure")

# [Greenlock](https://git.coolaj86.com/coolaj86/greenlock.js)&trade; for node.js

Greenlock provides Free SSL, Free Wildcard SSL, and Fully Automated HTTPS <br>
<small>certificates issued by Let's Encrypt v2 via [ACME](https://git.coolaj86.com/coolaj86/acme-v2.js)</small>

!["Lifetime Downloads"](https://img.shields.io/npm/dt/greenlock.svg "Lifetime Download Count can't be shown")
!["Monthly Downloads"](https://img.shields.io/npm/dm/greenlock.svg "Monthly Download Count can't be shown")
!["Weekly Downloads"](https://img.shields.io/npm/dw/greenlock.svg "Weekly Download Count can't be shown")
!["Stackoverflow Questions"](https://img.shields.io/stackexchange/stackoverflow/t/greenlock.svg "S.O. Question count can't be shown")

| A [Root](https://therootcompany.com) Project |
Greenlock works
in the [Commandline](https://git.coolaj86.com/coolaj86/greenlock-cli.js) (cli),
as a [Web Server](https://git.coolaj86.com/coolaj86/greenlock-express.js),
in [Web Browsers](https://greenlock.domains) (WebCrypto),
and with **node.js** ([npm](https://www.npmjs.com/package/greenlock)).

# Features

  - [x] Actively Maintained and Supported
    - [x] VanillaJS
    - [x] Limited Dependencies
  - [x] Automatic HTTPS
    - [x] Free SSL
    - [x] Free Wildcard SSL
    - [x] Multiple domain support (up to 100 altnames per SAN)
    - [x] Dynamic Virtual Hosting (vhost)
    - [x] Automatical renewal (10 to 14 days before expiration)
  - [x] Great ACME support via [acme.js](https://git.coolaj86.com/coolaj86/acme-v2.js)
    - [x] "dry run" with self-diagnostics
    - [x] ACME draft 12
    - [x] Let's Encrypt v2
    - [x] Let's Encrypt v1
  - [x] [Commandline](https://git.coolaj86.com/coolaj86/greenlock-cli.js) (cli) Utilities
    - [x] Works with `bash`, `fish`, `zsh`, `cmd.exe`, `PowerShell`, and more
  - [x] [Browser](https://git.coolaj86.com/coolaj86/greenlock.html) Support
  - [x] Full node.js support, with modules for
    - [x] [http/https](https://git.coolaj86.com/coolaj86/greenlock-express.js/src/branch/master/examples), [Express.js](https://git.coolaj86.com/coolaj86/greenlock-express.js), [cluster](https://git.coolaj86.com/coolaj86/greenlock-cluster.js), [hapi](https://git.coolaj86.com/coolaj86/greenlock-hapi.js), [Koa](https://git.coolaj86.com/coolaj86/greenlock-koa.js), [rill](https://git.coolaj86.com/coolaj86/greenlock-rill.js), spdy, etc
  - [x] Great for securing your Raspberry Pi
  - [x] Extensible Plugin Support
    - [x] AWS S3, AWS Route53, Azure, CloudFlare, Consul, Digital Ocean, etcd, Redis

Greenlock.js for Middleware
------

Documentation for using Greenlock with
[http/https](https://git.coolaj86.com/coolaj86/greenlock-express.js/src/branch/master/examples),
[Express.js](https://git.coolaj86.com/coolaj86/greenlock-express.js),
[cluster](https://git.coolaj86.com/coolaj86/greenlock-cluster.js),
[hapi](https://git.coolaj86.com/coolaj86/greenlock-hapi.js),
[Koa](https://git.coolaj86.com/coolaj86/greenlock-koa.js),
[rill](https://git.coolaj86.com/coolaj86/greenlock-rill.js).

Table of Contents
=================

  * Install
  * **QuickStart**
  * Simple Examples
  * Example with ALL OPTIONS
  * API
  * Developer API
  * Change History
  * License

Install
=======

```bash
npm install --save greenlock@2.x
```

**Optional** dependency for *more efficient* RSA key generation:
<small>(important for those on ARM devices like Raspberry Pi)</small>
```bash
npm install --save ursa
```

**Optional** dependency for *Let's Encrypt v01* (pre-draft ACME spec) compatibility:
<small>(important for those on ARM devices like Raspberry Pi)</small>
```bash
npm install --save le-acme-core
```


### Production vs Staging

If at first you don't succeed, stop and switch to staging.

I've implemented a "dry run" loopback test with self diagnostics
so it's pretty safe to start off with the production URLs
and be far less likely to hit the bad request rate limits.

However, if your first attempt to get a certificate fails
I'd recommend switching to the staging acme server to debug -
unless you're very clear on what the failure was and how to fix it.

```
{ server: 'https://acme-staging-v02.api.letsencrypt.org/directory' }
```

### QuickStart Screencast

Watch the QuickStart demonstration: [https://youtu.be/e8vaR4CEZ5s](https://youtu.be/e8vaR4CEZ5s)

<a href="https://www.youtube.com/watch?v=e8vaR4CEZ5s&list=PLZaEVINf2Bq_lrS-OOzTUJB4q3HxarlXk"><img src="https://i.imgur.com/Y8ix6Ts.png" title="QuickStart Video" alt="YouTube Video Preview" /></a>

* [0:00](https://www.youtube.com/watch?v=e8vaR4CEZ5s&list=PLZaEVINf2Bq_lrS-OOzTUJB4q3HxarlXk#t=0) - Intro
* [2:22](https://www.youtube.com/watch?v=e8vaR4CEZ5s&list=PLZaEVINf2Bq_lrS-OOzTUJB4q3HxarlXk#t=142) - Demonstrating QuickStart Example
* [6:37](https://www.youtube.com/watch?v=e8vaR4CEZ5s&list=PLZaEVINf2Bq_lrS-OOzTUJB4q3HxarlXk?t=397) - Troubleshooting / Gotchas

#### Production Configuration (Part 2)

* [1:00](https://www.youtube.com/watch?v=bTEn93gxY50&index=2&list=PLZaEVINf2Bq_lrS-OOzTUJB4q3HxarlXk&t=60) - Bringing Greenlock into an Existing Express Project
* [2:26](https://www.youtube.com/watch?v=bTEn93gxY50&index=2&list=PLZaEVINf2Bq_lrS-OOzTUJB4q3HxarlXk&t=146) - The `approveDomains` callback

#### Security Concerns (Part 3)

* [0:00](https://www.youtube.com/watch?v=aZgVqPzoZTY&index=3&list=PLZaEVINf2Bq_lrS-OOzTUJB4q3HxarlXk) - Potential Attacks, and Mitigation


Easy as 1, 2, 3... 4
=====

Greenlock is built to incredibly easy to use, without sacrificing customization or extensibility.

The following examples range from just a few lines of code for getting started,
to more robust examples that you might start with for an enterprise-grade use of the ACME api.

* Automatic HTTPS (for single sites)
* Fully Automatic HTTPS (for multi-domain vhosts)
* Manual HTTPS (for API integration)

Automatic HTTPS
---------------

**Note**: For (fully) automatic HTTPS you may prefer
the [Express.js module](https://git.coolaj86.com/coolaj86/greenlock-express.js)

This works for most people, but it's not as fun as some of the other examples.

Great when

 - [x] You only need a limited number of certificates
 - [x] You want to use the bare node http and https modules without fluff

```js
////////////////////
// INIT GREENLOCK //
////////////////////

var greenlock = require('greenlock').create({
  email: 'user@example.com'           // IMPORTANT: Change email and domains
, agreeTos: true                      // Accept Let's Encrypt v2 Agreement
, configDir: '~/.config/acme'         // A writable folder (a non-fs plugin)

, communityMember: true               // Get (rare) non-mandatory updates about cool greenlock-related stuff (default false)
, securityUpdates: true               // Important and mandatory notices related to security or breaking API changes (default true)
});
```

```js
////////////////////
// CREATE SERVERS //
////////////////////

var redir = require('redirect-https')();
require('http').createServer(greenlock.middleware(redir)).listen(80);

require('spdy').createServer(greenlock.tlsOptions, function (req, res) {
  res.end('Hello, Secure World!');
}).listen(443);
```

Fully Automatic HTTPS
------------

**Note**: For (fully) automatic HTTPS you may prefer
the [Express.js module](https://git.coolaj86.com/coolaj86/greenlock-express.js)

Great when

 - [x] You have a growing number of domains
 - [x] You're integrating into your own hosting solution
 - [x] Customize ACME http-01 or dns-01 challenge

```js
////////////////////
// INIT GREENLOCK //
////////////////////

var path = require('path');
var os = require('os')
var Greenlock = require('greenlock');

var greenlock = Greenlock.create({
  version: 'draft-12'
, server: 'https://acme-v02.api.letsencrypt.org/directory'

  // Use the approveDomains callback to set per-domain config
  // (default: approve any domain that passes self-test of built-in challenges)
, approveDomains: approveDomains

  // the default servername to use when the client doesn't specify
, servername: 'example.com'

  // If you wish to replace the default account and domain key storage plugin
, store: require('le-store-certbot').create({
    configDir: path.join(os.homedir(), 'acme/etc')
  , webrootPath: '/tmp/acme-challenges'
  })
});


/////////////////////
// APPROVE DOMAINS //
/////////////////////

var http01 = require('le-challenge-fs').create({ webrootPath: '/tmp/acme-challenges' });
function approveDomains(opts, certs, cb) {
  // This is where you check your database and associated
  // email addresses with domains and agreements and such

  // Opt-in to submit stats and get important updates
  opts.communityMember = true;

  // If you wish to replace the default challenge plugin, you may do so here
  opts.challenges = { 'http-01': http01 };

  // The domains being approved for the first time are listed in opts.domains
  // Certs being renewed are listed in certs.altnames
  // certs.domains;
  // certs.altnames;
  opts.email = 'john.doe@example.com';
  opts.agreeTos = true;

  // NOTE: you can also change other options such as `challengeType` and `challenge`
  // opts.challengeType = 'http-01';
  // opts.challenge = require('le-challenge-fs').create({});

  cb(null, { options: opts, certs: certs });
}


////////////////////
// CREATE SERVERS //
////////////////////

var redir = require('redirect-https')();
require('http').createServer(greenlock.middleware(redir)).listen(80);

require('https').createServer(greenlock.tlsOptions, function (req, res) {
  res.end('Hello, Secure World!');
}).listen(443);
```

Manual HTTPS
-------------

Here's a taste of the API that you might use if building a commandline tool or API integration
that doesn't use node's SNICallback.

```


/////////////////////
// SET USER PARAMS //
/////////////////////

var opts = {
  domains: [ 'example.com'        // CHANGE EMAIL AND DOMAINS
           , 'www.example.com' ]
, email: 'user@example.com'
, agreeTos: true                  // Accept Let's Encrypt v2 Agreement
, communityMember: true           // Help make Greenlock better by submitting
                                  // stats and getting updates
};


////////////////////
// INIT GREENLOCK //
////////////////////

var greenlock = require('greenlock').create({
  version: 'draft-12'
, server: 'https://acme-v02.api.letsencrypt.org/directory'
, configDir: '/tmp/acme/etc'
});


///////////////////
// GET TLS CERTS //
///////////////////

greenlock.register(opts).then(function (certs) {
  console.log(certs);
  // privkey, cert, chain, expiresAt, issuedAt, subject, altnames
}, function (err) {
  console.error(err);
});
```

The domain key and ssl certificates you get back can be used in a webserver like this:

```js
var tlsOptions = { key: certs.privkey, cert: certs.cert + '\r\n' + certs.chain };
require('https').createServer(tlsOptions, function (req, res) {
  res.end('Hello, Secure World!');
}).listen(443);
```

Example with ALL OPTIONS
=========

The configuration consists of 3 components:

* Storage Backend (search npm for projects starting with 'le-store-')
* ACME Challenge Handlers (search npm for projects starting with 'le-challenge-')
* Letsencryt Config (this is all you)

```javascript
'use strict';

var Greenlock = require('greenlock');
var greenlock;


// Storage Backend
var leStore = require('le-store-certbot').create({
  configDir: '~/acme/etc'                                 // or /etc/letsencrypt or wherever
, debug: false
});


// ACME Challenge Handlers
var leHttpChallenge = require('le-challenge-fs').create({
  webrootPath: '~/acme/var/'                              // or template string such as
, debug: false                                            // '/srv/www/:hostname/.well-known/acme-challenge'
});


function leAgree(opts, agreeCb) {
  // opts = { email, domains, tosUrl }
  agreeCb(null, opts.tosUrl);
}

greenlock = Greenlock.create({
  version: 'draft-12'                                     // 'draft-12' or 'v01'
                                                          // 'draft-12' is for Let's Encrypt v2 otherwise known as ACME draft 12
                                                          // 'v02' is an alias for 'draft-12'
                                                          // 'v01' is for the pre-spec Let's Encrypt v1
  //
  // staging API
  //server: 'https://acme-staging-v02.api.letsencrypt.org/directory'

  //
  // production API
  server: 'https://acme-v02.api.letsencrypt.org/directory'

, store: leStore                                          // handles saving of config, accounts, and certificates
, challenges: {
    'http-01': leHttpChallenge                            // handles /.well-known/acme-challege keys and tokens
  }
, challengeType: 'http-01'                                // default to this challenge type
, agreeToTerms: leAgree                                   // hook to allow user to view and accept LE TOS
//, sni: require('le-sni-auto').create({})                // handles sni callback

                                                          // renewals happen at a random time within this window
, renewWithin: 14 * 24 * 60 * 60 * 1000                   // certificate renewal may begin at this time
, renewBy:     10 * 24 * 60 * 60 * 1000                   // certificate renewal should happen by this time

, debug: false
//, log: function (debug) {console.log.apply(console, args);} // handles debug outputs
});


// If using express you should use the middleware
// app.use('/', greenlock.middleware());
//
// Otherwise you should see the test file for usage of this:
// greenlock.challenges['http-01'].get(opts.domain, key, val, done)



// Check in-memory cache of certificates for the named domain
greenlock.check({ domains: [ 'example.com' ] }).then(function (results) {
  if (results) {
    // we already have certificates
    return;
  }


  // Register Certificate manually
  greenlock.register({

    domains: ['example.com']                                // CHANGE TO YOUR DOMAIN (list for SANS)
  , email: 'user@email.com'                                 // CHANGE TO YOUR EMAIL
  , agreeTos: ''                                            // set to tosUrl string (or true) to pre-approve (and skip agreeToTerms)
  , rsaKeySize: 2048                                        // 2048 or higher
  , challengeType: 'http-01'                                // http-01, tls-sni-01, or dns-01

  }).then(function (results) {

    console.log('success');

  }, function (err) {

    // Note: you must either use greenlock.middleware() with express,
    // manually use greenlock.challenges['http-01'].get(opts, domain, key, val, done)
    // or have a webserver running and responding
    // to /.well-known/acme-challenge at `webrootPath`
    console.error('[Error]: node-greenlock/examples/standalone');
    console.error(err.stack);

  });

});
```

Here's what `results` looks like:

```javascript
{ privkey: ''     // PEM encoded private key
, cert: ''        // PEM encoded cert
, chain: ''       // PEM encoded intermediate cert
, issuedAt: 0     // notBefore date (in ms) parsed from cert
, expiresAt: 0    // notAfter date (in ms) parsed from cert
, subject: ''     // example.com
, altnames: []    // example.com,www.example.com
}
```

API
---

The full end-user API is exposed in the example above and includes all relevant options.

```
greenlock.register(opts)
greenlock.check(opts)
```

### Helper Functions

We do expose a few helper functions:

* Greenlock.validDomain(hostname) // returns '' or the hostname string if it's a valid ascii or punycode domain name

TODO fetch domain tld list

### Template Strings

The following variables will be tempalted in any strings passed to the options object:

* `~/` replaced with `os.homedir()` i.e. `/Users/aj`
* `:hostname` replaced with the first domain in the list i.e. `example.com`

### Dangerous Options

By default SNI is made to lowercase and is automatically rejected if it contains invalid characters for a domain.
This behavior can be modified:

  * `__dns_allow_dangerous_names` allow SNI names like "Robert'); DROP TABLE Students;"
  * `__dns_preserve_case` passes SNI names such as "ExAMpLE.coM" without converting to lower case

Developer API
-------------

If you are developing an `le-store-*` or `le-challenge-*` plugin you need to be aware of
additional internal API expectations.

**IMPORTANT**:

Use `v2.0.0` as your initial version - NOT v0.1.0 and NOT v1.0.0 and NOT v3.0.0.
This is to indicate that your module is compatible with v2.x of node-greenlock.

Since the public API for your module is defined by node-greenlock the major version
should be kept in sync.

### store implementation

See <https://git.coolaj86.com/coolaj86/le-store-SPEC.js>

* getOptions()
* accounts.
  * checkKeypair(opts, cb)
  * check(opts, cb)
  * setKeypair(opts, keypair, cb)
  * set(opts, reg, cb)
* certificates.
  * checkKeypair(opts, cb)
  * check(opts, cb)
  * setKeypair(opts, keypair, cb)
  * set(opts, reg, cb)

### challenge implementation

See https://git.coolaj86.com/coolaj86/le-challenge-fs.js

* `.set(opts, domain, key, value, cb);`         // opts will be saved with domain/key
* `.get(opts, domain, key, cb);`                // opts will be retrieved by domain/key
* `.remove(opts, domain, key, cb);`             // opts will be retrieved by domain/key

# Change History

* v2.6
  * better defaults, fewer explicit options
  * better pre-flight self-tests, explicit domains not required
* v2.5
  * bugfix JWK (update rsa-compat)
  * eliminate all external non-optional dependencies
* v2.4
  * v2.4.3 - add security updates (default true) independent of community updates (default false)
* v2.2 - Let's Encrypt v2 Support
  * v2.2.11 - documentation updates
  * v2.2.10 - don't let SNICallback swallow approveDomains errors 6286883fc2a6ebfff711a540a2e4d92f3ac2907c
  * v2.2.8 - communityMember option support
  * v2.2.7 - bugfix for wildcard support
  * v2.2.5 - node v6.x compat
  * v2.2.4 - don't promisify all of `dns`
  * v2.2.3 - `renewWithin` default to 14 days
  * v2.2.2 - replace git dependency with npm
  * v2.2.1 - April 2018 **Let's Encrypt v2** support
* v2.1.17 - Nov 5th 2017 migrate back to personal repo
* v2.1.9 - Jan 18th 2017 renamed to greenlock
* v2.0.2 - Aug 9th 2016 update readme
* v2.0.1 - Aug 9th 2016
  * major refactor
  * simplified API
  * modular plugins
  * knock out bugs
* v1.5.0 now using letiny-core v2.0.0 and rsa-compat
* v1.4.x I can't remember... but it's better!
* v1.1.0 Added letiny-core, removed node-letsencrypt-python
* v1.0.2 Works with node-letsencrypt-python
* v1.0.0 Thar be dragons

# Legal

Greenlock&trade; is a [trademark](https://greenlock.domains/legal/#trademark) of AJ ONeal

[greenlock.js](https://git.coolaj86.com/coolaj86/greenlock.js) |
MPL-2.0 |
[Terms of Use](https://therootcompany.com/legal/#terms) |
[Privacy Policy](https://therootcompany.com/legal/#privacy)
