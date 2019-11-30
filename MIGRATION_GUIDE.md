# Migrating Guide

Greenlock v4 is the current version.

# v3 to v4

v4 is a very minor, but breaking, change from v3

### `configFile` is replaced with `configDir`

The default config file `./greenlock.json` is now `./greenlock.d/config.json`.

This was change was mode to eliminate unnecessary configuration that was inadvertantly introduced in v3.

### `.greenlockrc` is auto-generated

`.greenlockrc` exists for the sake of tooling - so that the CLI, Web API, and your code naturally stay in sync.

It looks like this:

```json
{
    "manager": {
        "module": "@greenlock/manager"
    },
    "configDir": "./greenlock.d"
}
```

If you deploy to a read-only filesystem, it is best that you create the `.greenlockrc` file as part
of your image and use that rather than including any configuration in your code.

# v2 to v4

**Greenlock Express** uses Greenlock directly, the same as before.

All options described for `Greenlock.create({...})` also apply to the Greenlock Express `init()` callback.

# Overview of Major Differences

-   Reduced API
-   No code in the config
    -   (config is completely serializable)
-   Manager callbacks replace `approveDomains`
-   Greenlock Express does more, with less config
    -   cluster is supported out-of-the-box
    -   high-performance
    -   scalable
-   ACME challenges are simplified
    -   init
    -   zones (dns-01)
    -   set
    -   get
    -   remove
-   Store callbacks are simplified
    -   accounts
        -   checkKeypairs
    -   certificates
        -   checkKeypairs
        -   check
        -   set

# Greenlock JavaScript API greatly reduced

Whereas before there were many different methods with nuance differences,
now there's just `create`, `get`, `renew`, and sometimes `add` ().

-   Greenlock.create({ maintainerEmail, packageAgent, notify })
-   Greenlock.get({ servername, wildname, duplicate, force })
    -   (just a convenience wrapper around renew)
-   Greenlock.renew({ subject, altnames, issuedBefore, expiresAfter })
    -   (retrieves, issues, renews, all-in-one)
-   _optional_ Greenlock.add({ subject, altnames, subscriberEmail })
    -   (partially replaces `approveDomains`)

Also, some disambiguation on terms:

-   `domains` was often ambiguous and confusing, it has been replaced by:
    -   `subject` refers to the subject of a certificate - the primary domain
    -   `altnames` refers to the domains in the SAN (Subject Alternative Names) section of the certificate
    -   `servername` refers to the TLS (SSL) SNI (Server Name Indication) request for a cetificate
    -   `wildname` refers to the wildcard version of the servername (ex: `www.example.com => *.example.com`)

When you create an instance of Greenlock, you only supply package and maintainer info.

All other configuration is A) optional and B) handled by the _Manager_.

```js
'use strict';

var pkg = require('./package.json');

var Greenlock = require('greenlock');
var greenlock = Greenlock.create({
    // used for the ACME client User-Agent string as per RFC 8555 and RFC 7231
    packageAgent: pkg.name + '/' + pkg.version,

    // used as the contact for critical bug and security notices
    // should be the same as pkg.author.email
    maintainerEmail: 'jon@example.com',

    // used for logging background events and errors
    notify: function(ev, args) {
        if ('error' === ev || 'warning' === ev) {
            console.error(ev, args);
            return;
        }
        console.info(ev, args);
    }
});
```

By default **no certificates will be issued**. See the _manager_ section.

When you want to get a single certificate, you use `get`, which will:

-   will return null if neither the `servername` or its `wildname` (wildcard) variant can be found
-   retrieve a non-expired certificate, if possible
-   will renew the certificate in the background, if stale
-   will wait for the certificate to be issued if new

```js
greenlock
    .get({ servername: 'www.example.com' })
    .then(function(result) {
        if (!result) {
            // certificate is not on the approved list
            return null;
        }

        var fullchain = result.pems.cert + '\n' + result.pems.chain + '\n';
        var privkey = result.pems.privkey;

        return {
            fullchain: fullchain,
            privkey: privkey
        };
    })
    .catch(function(e) {
        // something went wrong in the renew process
        console.error(e);
    });
```

By default **no certificates will be issued**. See the _manager_ section.

When you want to renew certificates, _en masse_, you use `renew`, which will:

-   check all certificates matching the given criteria
-   only renew stale certificates by default
-   return error objects (will NOT throw exception for failed renewals)

```js
greenlock
    .renew({})
    .then(function(results) {
        if (!result.length) {
            // no certificates found
            return null;
        }

        // [{ site, error }]
        return results;
    })
    .catch(function(e) {
        // an unexpected error, not related to renewal
        console.error(e);
    });
```

Options:

| Option        | Description                                                                |
| ------------- | -------------------------------------------------------------------------- |
| `altnames`    | only check and renew certs matching these altnames (including wildcards)   |
| `renewBefore` | only check and renew certs marked for renewal before the given date, in ms |
| `duplicate`   | renew certificates regardless of timing                                    |
| `force`       | allow silly things, like tiny `renewOffset`s                               |

By default **no certificates will be issued**. See the _manager_ section.

# Greenlock Express Example

The options that must be returned from `init()` are the same that are used in `Greenlock.create()`,
with a few extra that are specific to Greenlock Express:

```js
require('@root/greenlock-express')
    .init(function() {
        // This object will be passed to Greenlock.create()

        var options = {
            // some options, like cluster, are special to Greenlock Express

            cluster: false,

            // The rest are the same as for Greenlock

            packageAgent: pkg.name + '/' + pkg.version,
            maintainerEmail: 'jon@example.com',
            notify: function(ev, args) {
                console.info(ev, args);
            }
        };

        return options;
    })
    .serve(function(glx) {
        // will start servers on port 80 and 443

        glx.serveApp(function(req, res) {
            res.end('Hello, Encrypted World!');
        });

        // you can get access to the raw server (i.e. for websockets)

        glx.httpsServer(); // returns raw server object
    });
```

# _Manager_ replaces `approveDomains`

`approveDomains` was always a little confusing. Most people didn't need it.

Instead, now there is a simple config file that will work for most people,
as well as a set of callbacks for easy configurability.

### Default Manager

The default manager is `@greenlock/manager` and the default `configDir` is `./.greenlock.d`.

The config file should look something like this:

`./greenlock.d/config.json`:

```json
{
    "subscriberEmail": "jon@example.com",
    "agreeToTerms": true,
    "sites": {
        "example.com": {
            "subject": "example.com",
            "altnames": ["example.com", "www.example.com"]
        }
    }
}
```

You can specify a `acme-dns-01-*` or `acme-http-01-*` challenge plugin globally, or per-site.

```json
{
    "subscriberEmail": "jon@example.com",
    "agreeToTerms": true,
    "sites": {
        "example.com": {
            "subject": "example.com",
            "altnames": ["example.com", "www.example.com"],
            "challenges": {
                "dns-01": {
                    "module": "acme-dns-01-digitalocean",
                    "token": "apikey-xxxxx"
                }
            }
        }
    }
}
```

The same is true with `greenlock-store-*` plugins:

```json
{
    "subscriberEmail": "jon@example.com",
    "agreeToTerms": true,
    "sites": {
        "example.com": {
            "subject": "example.com",
            "altnames": ["example.com", "www.example.com"]
        }
    },
    "store": {
        "module": "greenlock-store-fs",
        "basePath": "~/.config/greenlock"
    }
}
```

### Customer Manager, the lazy way

At the very least you have to implement `get({ servername, wildname })`.

```js
var greenlock = Greenlock.create({
    packageAgent: pkg.name + '/' + pkg.version,
    maintainerEmail: 'jon@example.com',
    notify: notify,

    packageRoot: __dirname,
    manager: {
        module: './manager.js'
    }
});

function notify(ev, args) {
    if ('error' === ev || 'warning' === ev) {
        console.error(ev, args);
        return;
    }
    console.info(ev, args);
}
```

In the simplest case you can ignore all incoming options
and return a single site config in the same format as the config file

`./manager.js`:

```js
'use strict';

module.exports.create = function() {
    return {
        get: async function({ servername }) {
            // do something to fetch the site
            var site = {
                subject: 'example.com',
                altnames: ['example.com', 'www.example.com']
            };

            return site;
        }
    };
};
```

If you want to use wildcards or local domains for a specific domain, you must specify the `dns-01` challenge plugin to use:

```js
'use strict';

module.exports.create = function() {
    return {
        get: async function({ servername }) {
            // do something to fetch the site
            var site = {
                subject: 'example.com',
                altnames: ['example.com', 'www.example.com'],

                // dns-01 challenge
                challenges: {
                    'dns-01': {
                        module: 'acme-dns-01-namedotcom',
                        apikey: 'xxxx'
                    }
                }
            };

            return site;
        }
    };
};
```

### Customer Manager, Complete

See <https://git.rootprojects.org/root/greenlock-manager-test.js#quick-start>

# ACME Challenge Plugins

The ACME challenge plugins are just a few simple callbacks:

-   `init`
-   `zones` (dns-01 only)
-   `set`
-   `get`
-   `remove`

They are described here:

-   [dns-01 documentation](https://git.rootprojects.org/root/acme-dns-01-test.js)
-   [http-01 documentation](https://git.rootprojects.org/root/acme-http-01-test.js)

# Key and Cert Store Plugins

Again, these are just a few simple callbacks:

-   `certificates.checkKeypair`
-   `certificates.check`
-   `certificates.setKeypair`
-   `certificates.set`
-   `accounts.checkKeypair`
-   `accounts.check` (optional)
-   `accounts.setKeypair`
-   `accounts.set` (optional)

The name `check` is used instead of `get` because they only need to return something if it exists. They do not need to fail, nor do they need to generate anything.

They are described here:

-   [greenlock store documentation](https://git.rootprojects.org/root/greenlock-store-test.js)

If you are just implenting in-house and are not going to publish a module, you can also do some hack things like this:
