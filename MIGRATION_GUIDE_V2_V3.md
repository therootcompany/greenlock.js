# Migrating from Greenlock v2 to v3

**Greenlock Express** uses Greenlock directly, the same as before.

All options described for `Greenlock.create({...})` also apply to the Greenlock Express `init()` callback.

# Overview of Major Differences

## Greenlock JavaScript API greatly reduced

Whereas before there were many different methods with nuance differences,
now there's just `create`, `get`, `renew`, and sometimes `add` ().

    -   Greenlock.create({ maintainerEmail, packageAgent, notify })
    -   Greenlock.get({ servername, wildname, duplicate, force })
        - (just a convenience wrapper around renew)
    -   Greenlock.renew({ subject, altnames, issuedBefore, expiresAfter })
        - (retrieves, issues, renews, all-in-one)
    -   _optional_ Greenlock.add({ subject, altnames, subscriberEmail })
        -   (partially replaces `approveDomains`)
    - `domains` was often ambiguous and confusing, it has been replaced by:
        - `subject` refers to the subject of a certificate - the primary domain
        - `altnames` refers to the domains in the SAN (Subject Alternative Names) section of the certificate
        - `servername` refers to the TLS (SSL) SNI (Server Name Indication) request for a cetificate
        - `wildname` refers to the wildcard version of the servername (ex: `www.example.com => *.example.com`)

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
        maintainerEmail: 'jon@example.com'

  // used for logging background events and errors
  notify: function (ev, args) {
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
| `servernames` | only check and renew certs matching these servernames                      |
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
		return {
			cluster: false,
			packageAgent: pkg.name + '/' + pkg.version,
			maintainerEmail: 'jon@example.com',
			notify: function(ev, args) {
				if ('error' === ev || 'warning' === ev) {
					console.error(ev, args);
					return;
				}
				console.info(ev, args);
			}
		};
	})
	.serve(function(glx) {
		glx.serveApp(function(req, res) {
			res.end('Hello, Encrypted World!');
		});
	});
```

## _Manager_ replaces `approveDomains`

`approveDomains` was always a little confusing. Most people didn't need it.

Instead, now there is a simple config file that will work for most people,
as well as a set of callbacks for easy configurability.

### Default Manager

The default manager is `greenlock-manager-fs` and the default `configFile` is `~/.config/greenlock/manager.json`.

The config file should look something like this:

`~/.config/greenlock/manager.json`:

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

You can specify a `acme-dns-01-*` or `acme-http-01-*` challenge plugin globally, or per-site. The same is true with `greenlock-store-*` plugins:

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

### Customer Manager

At the very least you have to implement `find({ servername })`.

Since this is a very common use case, it's supported out of the box as part of the default manager plugin:

```js
var greenlock = Greenlock.create({
	packageAgent: pkg.name + '/' + pkg.version,
	maintainerEmail: 'jon@example.com',
	notify: notify,
	find: find
});

// In the simplest case you can ignore all incoming options
// and return a single site config in the same format as the config file

function find(options) {
	var servername = options.servername; // www.example.com
	var wildname = options.wildname; // *.example.com
	return Promise.resolve([
		{ subject: 'example.com', altnames: ['example.com', 'www.example.com'] }
	]);
}

function notify(ev, args) {
	if ('error' === ev || 'warning' === ev) {
		console.error(ev, args);
		return;
	}
	console.info(ev, args);
}
```

If you want to use wildcards or local domains, you must specify the `dns-01` challenge plugin to use:

```js
function find(options) {
	var servername = options.servername; // www.example.com
	var wildname = options.wildname; // *.example.com
	return Promise.resolve([
		{
			subject: 'example.com',
			altnames: ['example.com', 'www.example.com'],
			challenges: {
				'dns-01': { module: 'acme-dns-01-namedotcom', apikey: 'xxxx' }
			}
		}
	]);
}
```

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

### Custome Store, The hacky / lazy way

`/path/to/project/my-hacky-store.js`:

```js
module.exports.create = function(options) {
	// ex: /path/to/account.ecdsa.jwk.json
	var accountJwk = require(options.accountJwkPath);
	// ex: /path/to/privkey.rsa.pem
	var serverPem = fs.readFileSync(options.serverPemPath, 'ascii');
	var store = {};

	// bare essential account callbacks
	store.accounts = {
		checkKeypair: function() {
			// ignore all options and just return a single, global keypair
			return Promise.resolve({
				privateKeyJwk: accountJwk
			});
		},
		setKeypair: function() {
			// this will never get called if checkKeypair always returns
			return Promise.resolve({});
		}
	};

	// bare essential cert and key callbacks
	store.certificates = {
		checkKeypair: function() {
			// ignore all options and just return a global server keypair
			return {
				privateKeyPem: serverPem
			};
		},
		setKeypair: function() {
			// never gets called if checkKeypair always returns an existing key
			return Promise.resolve(null);
		},
		check: function(args) {
			var subject = args.subject;
			// make a database call or whatever to get a certificate
			return goGetCertBySubject(subject).then(function() {
				return {
					pems: {
						chain: '<PEM>',
						cert: '<PEM>'
					}
				};
			});
		},
		set: function(args) {
			var subject = args.subject;
			var cert = args.pems.cert;
			var chain = args.pems.chain;

			// make a database call or whatever to get a certificate
			return goSaveCert({
				subject,
				cert,
				chain
			});
		}
	};
};
```

### Using the hacky / lazy store plugin

That sort of implementation won't pass the test suite, but it'll work just fine a use case where you only have one subscriber email (most of the time),
you only have one server key (not recommended, but works), and you only really want to worry about storing cetificates.

Then you could assign it as the default for all of your sites:

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
		"module": "/path/to/project/my-hacky-store.js",
		"accountJwkPath": "/path/to/account.ecdsa.jwk.json",
		"serverPemPath": "/path/to/privkey.rsa.pem"
	}
}
```
