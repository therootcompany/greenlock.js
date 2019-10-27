# @root/greenlock

🔐 Free SSL, Free Wildcard SSL, and Fully Automated HTTPS for Node.js and Browsers, issued by Let's Encrypt v2 via ACME

Greenlock&trade; is the easiest way to integrate Let's Encrypt into your projects, products, and infrastructure.

-   [x] **Wildcard** Certificates
-   [x] **IoT** Environments
-   [x] **Enterprise** and **On-Prem**
-   [x] **Private** Networks
-   [x] **Localhost** Development
-   [x] **Web Hosting** Providers
-   [x] **Commercial** support

We've built it simple enough for Hobbyists, and robust enough for the Enterprise.

<!--
# Localhost Development

<details>
<summary>HTTPS on Localhost</summary>
TODO

</details>

# WebServer with Automatic HTTPS

<details>
<summary>Learn more about the Greenlock Web Server</summary>
TODO
</details>

# Commandline

<details>
<summary>Learn more about the Greenlock CLI</summary>
TODO
</details>

-->

# JavaScript Library

<details>
<summary>Greenlock API (shared among JS implementations)</summary>

### Instantiate

```js
// Creates an instance of greenlock with certain default values

var gl = Greenlock.create({
	// Staging for testing environments
	staging: true,

	// This should be the contact who receives critical bug and security notifications
	// Optionally, you may receive other (very few) updates, such as important new features
	maintainerEmail: 'jon@example.com',
	maintainerUpdates: true, // default: false

	// The "Let's Encrypt Subscriber" (often the same as the maintainer)
	// NOT the end customer (except where that is also the maintainer)
	subscriberEmail: 'jon@example.com',
	agreeToTerms: true // default: false
});
```

| Parameter                 | Description                                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| servername                | the default servername to use for non-sni requests (many IoT clients)                                                                                      |
| maintainerEmail           | the developer contact for critical bug and security notifications                                                                                          |
| maintainerUpdates         | (default: false) receive occasional non-critical notifications                                                                                             |
| maintainerPackage         | if you publish your package for others to use, `require('./package.json').name` here                                                                       |
| maintainerPackageVersion  | if you publish your package for others to use, `require('./package.json').version` here                                                                    |
| subscriberEmail           | the contact who agrees to the Let's Encrypt Subscriber Agreement and the Greenlock Terms of Service<br>this contact receives renewal failure notifications |
| agreeToTerms              | (default: false) either 'true' or a function that presents the Terms of Service and returns it once accepted                                               |
| store                     | override the default storage module                                                                                                                        |
| store.module              | the name of your storage module                                                                                                                            |
| store.xxxx                | options specific to your storage module                                                                                                                    |
| challenges['http-01']     | provide an http-01 challenge module                                                                                                                        |
| challenges['dns-01']      | provide a dns-01 challenge module                                                                                                                          |
| challenges['tls-alpn-01'] | provide a tls-alpn-01 challenge module                                                                                                                     |
| challenges[type].module   | the name of your challenge module                                                                                                                          |
| challenges[type].xxxx     | module-specific options                                                                                                                                    |

### Add Approved Domains

```js
gl.add({
	subject: 'example.com',
	altnames: ['example.com', 'www.example.com', 'exampleapi.com']
});
```

| Parameter       | Description                                                                        |
| --------------- | ---------------------------------------------------------------------------------- |
| subject         | the first domain on, and identifier of the certificate                             |
| altnames        | first domain, plus additional domains<br>note: the order should always be the same |
| subscriberEmail | if different from the default (i.e. multi-tenant, whitelabel)                      |
| agreeToTerms    | if subscriber is different from the default                                        |

### Issue and Renew Certificates

This will renew only domains that have reached their `renewAt` or are within the befault `renewOffset`.

```js
return greenlock
	.renew()
	.then(function(pems) {
		console.info(pems);
	})
	.then(function(results) {
		results.forEach(function(site) {
			if (site.error) {
				console.error(site.subject, site.error);
				return;
			}
		});
	});
```

| Parameter  | Type | Description                                                |
| ---------- | ---- | ---------------------------------------------------------- |
| (optional) | -    | ALL parameters are optional, but some should be paired     |
| force      | bool | force silly options, such as tiny durations                |
| duplicate  | bool | force the domain to renew, regardless of age or expiration |

<!--
| servername  | string<br>hostname   | renew the certificate that has this domain in its altnames (for ServerName Indication / SNI lookup) |
| renewOffset | string<br>+ duration | renew domains that have been **issued** after the given duration. ex: '45d' (45 days _after_)       |
| renewOffset | string<br>- duration | renew domains, by this duration, before they **expire**. ex: '-3w' (3 weeks _before_)               |
-->

Note: only previous approved domains (via `gl.add()`) may be renewed

Note: this will NOT throw an **error**. It will return an array of certifates or errors.

### More

TODO

</details>

<details>
<summary>Node.js</summary>

```bash
npm install --save @root/greenlock
npm install --save greenlock-manager-fs
npm install --save greenlock-store-fs
npm install --save acme-http-01-standalone
```

<!--

TODO

</details>

<details>
<summary>Express.js</summary>

```js
'use strict';

var Greenlock = require(@root/greenlock-express);

var greenlock = Greenlock.create({
// for security and critical bug notices
maintainerEmail: 'jon@example.com'

// for
maintainerNewsletter: true
});
```

</details>

<details>
<summary>WebPack</summary>
TODO
</details>

<details>
<summary>VanillaJS for Browsers</summary>
TODO
</details>

-->

# HTTP-01 &amp; DNS-01 Integrations

For Public Web Servers running on a VPS, the **default HTTP-01 challenge plugin**
will work just fine for most people.

However, for

-   **Wildcard Certificates**
-   **IoT Environments**
-   **Enterprise On-Prem**
-   **Private Networks**

Greenlock provides an easy way to integrate Let's Encrypt with your existing services
through a variety of **DNS-01** infrastructure

Why
Typically file propagation is faster and more reliably than DNS propagation.
Therefore, http-01 will be preferred to dns-01 except when wildcards or **private domains** are in use.

http-01 will only be supplied as a defaut if no other challenge is provided.

You can use ACME (Let's Encrypt) with

-   [x] DNS-01 Challenges
    -   CloudFlare
    -   [Digital Ocean](https://git.rootprojects.org/root/acme-dns-01-digitalocean.js)
    -   [DNSimple](https://git.rootprojects.org/root/acme-dns-01-dnsimple.js)
    -   [DuckDNS](https://git.rootprojects.org/root/acme-dns-01-duckdns.js)
    -   [GoDaddy](https://git.rootprojects.org/root/acme-dns-01-godaddy.js)
    -   [Gandi](https://git.rootprojects.org/root/acme-dns-01-gandi.js)
    -   [NameCheap](https://git.rootprojects.org/root/acme-dns-01-namecheap.js)
    -   [Name&#46;com](https://git.rootprojects.org/root/acme-dns-01-namedotcom.js)
    -   Route53 (AWS)
    -   [Vultr](https://git.rootprojects.org/root/acme-dns-01-vultr.js)
    -   Build your own
-   [x] HTTP-01 Challenges
    -   [In-Memory](https://git.rootprojects.org/root/acme-http-01-standalone.js) (Standalone)
    -   [FileSystem](https://git.rootprojects.org/root/acme-http-01-webroot.js) (WebRoot)
    -   S3 (AWS, Digital Ocean, etc)
-   [x] TLS-ALPN-01 Challenges
    -   Contact us to learn about Greenlock Pro
