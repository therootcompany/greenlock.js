Scraps
======

These are examples that we might come back and update (and would love help updating),
but they are more likely to cause confusion than success for the casual googled-it-and-got-here-er.

Probably Outdated Examples
========

The simplest example of setting up a webserver appropriately is probably `letsencrypt-cli` (~120 lines of code):

* [letsencrypt-cli//lib/standalone.js](https://github.com/Daplie/node-letsencrypt-cli/blob/master/lib/standalone.js)

Similary, `letsencrypt-cli`'s usage of `le.register()` is fairly simple (~75 lines of code):

* [letsencrypt-cli/bin/letsencrypt.js](https://github.com/Daplie/node-letsencrypt-cli/blob/master/bin/letsencrypt.js)

### One-Time Registration

Register a 90-day certificate manually, on a whim

**Note**: We've been running a fast development cycle and this example may be out of date.
The API *shouldn't* have changed much but, we probably need to come back and update it.

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
app.use('/', le.middleware());  // TODO le.middleware was moved to letsencrypt-express, we need to update the docs here


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

