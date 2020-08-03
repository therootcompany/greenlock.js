# New Documentation &amp; [v4 Migration Guide](https://git.rootprojects.org/root/greenlock.js/src/branch/master/MIGRATION_GUIDE.md)

We're still working on the full documentation for this new version,
so please be patient.

To start, check out the
[Migration Guide](https://git.rootprojects.org/root/greenlock.js/src/branch/master/MIGRATION_GUIDE.md).

!["Greenlock Logo"](https://git.rootprojects.org/root/greenlock.js/raw/branch/master/logo/greenlock-1063x250.png 'Greenlock lock logo and work mark')

!["Greenlock Function"](https://git.rootprojects.org/root/greenlock.js/raw/branch/master/logo/from-not-secure-to-secure-url-bar.png 'from url bar showing not secure to url bar showing secure')

# [Greenlock](https://git.rootprojects.org/root/greenlock.js) is Let's Encrypt for JavaScript

| Built by [Root](https://rootprojects.org) for [Hub](https://rootprojects.org/hub/)

Greenlock&trade; is an Automated Certificate Management Environement 🔐.

| **Greenlock** | [Greenlock Express](https://git.rootprojects.org/root/greenlock-express.js) | [ACME.js](https://git.rootprojects.org/root/acme.js) |

It uses **Let's Encrypt** to generate Free SSL Certificates, including **Wildcard** SSL.
It supports **Automated Renewal** of certs for Fully Automated HTTPS.

It's written in plain JavaScript and works in Node, Browsers, and WebPack.

the easiest way to integrate Let's Encrypt into your projects, products, and infrastructure.

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

# Quick Start

Greenlock is fully-automated, **SSL Certificate Manager** for IoT, Web Hosting, and Enterprise On-Prem, Edge, and Hybrid Cloud.

(though we started building it for [Home Servers](https://rootprojects.org/hub/))

You can use it for one-off certificates, like `certbot`,
but it is _much_ more powerful than that.

By setting just a few callbacks to let it know where it should store private keys and certificates,
it will automatically renew any certificate that you add to it, as long as the process is running.

Certificates are renewed every 45 days by default, and renewal checks will happen several times a day.

<details>
<summary>1. Configure</summary>

```js
'use strict';

var pkg = require('./package.json');
var Greenlock = require('greenlock');
var greenlock = Greenlock.create({
    packageRoot: __dirname,
    configDir: "./greenlock.d/",
    packageAgent: pkg.name + '/' + pkg.version,
    maintainerEmail: pkg.author,
    staging: true,
    notify: function(event, details) {
        if ('error' === event) {
            // `details` is an error object in this case
            console.error(details);
        }
    }
});

greenlock.manager
    .defaults({
        agreeToTerms: true,
        subscriberEmail: 'webhosting@example.com'
    })
    .then(function(fullConfig) {
        // ...
    });
```

</details>

<details>
<summary>2. Add Domains</summary>

The `subject` (primary domain on certificate) will be the id,
so it's very important that the order of the given domains
be deterministic.

```js
var altnames = ['example.com', 'www.example.com'];

greenlock
    .add({
        subject: altnames[0],
        altnames: altnames
    })
    .then(function() {
        // saved config to db (or file system)
    });
```

Issuance and renewal will start immediately, and run continually.

</details>

<details>
<summary>3. Test for Success</summary>

The `store` callbacks will be called every any of your certificates
are renewed.

However, you can do a quick one-off check with `get`.

It will return a certificate immediately (if available),
or wait for the renewal to complete (or for it to fail again).

```js
greenlock
    .get({ servername: subject })
    .then(function(pems) {
        if (pems && pems.privkey && pems.cert && pems.chain) {
            console.info('Success');
        }
        //console.log(pems);
    })
    .catch(function(e) {
        console.error('Big bad error:', e.code);
        console.error(e);
    });
```

</details>

# JavaScript API

<!--
<details>
<summary>Greenlock API (shared among JS implementations)</summary>
-->

<details>
<summary>Greenlock.create({ configDir, packageAgent, maintainerEmail, staging })</summary>

## Greenlock.create()

Creates an instance of greenlock with _environment_-level values.

```js

var pkg = require('./package.json');
var gl = Greenlock.create({
    configDir: './greenlock.d/',

    // Staging for testing environments
    staging: true,

    // This should be the contact who receives critical bug and security notifications
    // Optionally, you may receive other (very few) updates, such as important new features
    maintainerEmail: 'jon@example.com',

    // for an RFC 8555 / RFC 7231 ACME client user agent
    packageAgent: pkg.name + '/' pkg.version
});
```

| Parameter       | Description                                                                          |
| --------------- | ------------------------------------------------------------------------------------ |
| configDir       | the directory to use for file-based plugins                                          |
| maintainerEmail | the developer contact for critical bug and security notifications                    |
| packageAgent    | if you publish your package for others to use, `require('./package.json').name` here |
| staging         | use the Let's Encrypt staging URL instead of the production URL                      |
| directoryUrl    | for use with other (not Let's Encrypt) ACME services, and the Pebble test server     |

<!--
| maintainerUpdates         | (default: false) receive occasional non-critical notifications                                                                                             |
    maintainerUpdates: true // default: false
-->

</details>

<details>
<summary>Greenlock#manager.defaults()</summary>

## Greenlock#manager.defaults()

Acts as a getter when given no arguments.

Otherwise sets default, site-wide values as described below.

```js
greenlock.manager.defaults({
    // The "Let's Encrypt Subscriber" (often the same as the maintainer)
    // NOT the end customer (except where that is also the maintainer)
    subscriberEmail: 'jon@example.com',
    agreeToTerms: true
    challenges: {
      "http-01": {
        module: "acme-http-01-webroot",
        webroot: "/path/to/webroot"
      }
    }
});
```

| Parameter                 | Description                                                                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| agreeToTerms              | (default: false) either 'true' or a function that presents the Terms of Service and returns it once accepted                                                                       |
| challenges['http-01']     | provide an http-01 challenge module                                                                                                                                                |
| challenges['dns-01']      | provide a dns-01 challenge module                                                                                                                                                  |
| challenges['tls-alpn-01'] | provide a tls-alpn-01 challenge module                                                                                                                                             |
| challenges[type].module   | the name of your challenge module                                                                                                                                                  |
| challenges[type].xxxx     | module-specific options                                                                                                                                                            |
| renewOffset               | **leave the default** Other than for testing, leave this at the default of 45 days before expiration date (`'-45d'`) . Can also be set like `5w`, meaning 5 weeks after issue date |
| servername                | the default servername to use for non-sni requests (many IoT clients)                                                                                                              |
| subscriberEmail           | the contact who agrees to the Let's Encrypt Subscriber Agreement and the Greenlock Terms of Service<br>this contact receives renewal failure notifications                         |
| store                     | override the default storage module                                                                                                                                                |
| store.module              | the name of your storage module                                                                                                                                                    |
| store.xxxx                | options specific to your storage module                                                                                                                                            |

<!--

| serverId        | an arbitrary name to distinguish this server within a cluster of servers |

-->

</details>

<details>
<summary>Greenlock#add({ subject, altnames })</summary>

## Greenlock#add()

Greenlock is a **Automated Certificate Management Environment**.

Once you add a "site", it will begin to automatically renew, immediately.

The certificates will provided to the `store` callbacks as soon as they are ready, and whenever they renew.
Failure to renew will be reported to the `notify` callback.

You can also retrieve them one-off with `get`.

```js
gl.add({
    subject: 'example.com',
    altnames: ['example.com', 'www.example.com', 'exampleapi.com']
});
```

| Parameter       | Description                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------- |
| subject         | the first domain on, and identifier of the certificate                                       |
| altnames        | first domain, plus additional domains<br>note: the order should always be the same           |
| subscriberEmail | if different from the default (i.e. multi-tenant, whitelabel)                                |
| challenges      | (same as main config) use if this site needs to use non-default http-01 or dns-01 validation |

</details>

<details>
<summary>Greenlock#get({ servername })</summary>

## Greenlock#get()

**Disclaimer**: This is only intended for testing, demos, and SNICallback
(in [Greenlock Express](https://git.rootprojects.org/root/greenlock-express.js)).

Greenlock is intended to be left running to allow it to fetech and renew certifictates automatically.

It is intended that you use the `store` callbacks to new certificates instantly as soon as they renew.
This also protects you from accidentally stampeding the Let's Encrypt API with hundreds (or thousands)
of certificate requests.

-   [Store Callback Documentation](https://git.rootprojects.org/root/greenlock-store-test.js)

```js
return greenlock.get({ servername }).then(function(site) {
    if (!site) {
        console.log(servername + ' was not found in any site config');
        return;
    }

    var privkey = site.pems.privkey;
    var fullchain = site.pems.cert + '\n' + site.pems.chain + '\n';
    console.log(privkey);
    console.log(fullchain);
});
```

| Parameter  | Description                                                   |
| ---------- | ------------------------------------------------------------- |
| servername | any altname listed on the certificate (including the subject) |

</details>

<details>
<summary>Greenlock#renew({ renewBefore })</summary>

## Greenlock#renew()

This will renew only domains that have reached their `renewAt` or are within the befault `renewOffset`.

**Note**: This runs at regular intervals, multiple times a day, in the background.
You are not required to call it. If you implement the `store` callbacks, the certificates
will automatically be saved (and if you don't implement them, they all get saved to disk).

```js
return greenlock.renew({}).then(function(results) {
    results.forEach(function(site) {
        if (site.error) {
            console.error(site.subject, site.error);
            return;
        }
        console.log('Renewed certificate for', site.subject, site.altnames);
    });
});
```

| Parameter   | Type | Description                                                                     |
| ----------- | ---- | ------------------------------------------------------------------------------- |
| (optional)  |      | ALL parameters are optional, but some should be paired                          |
| force       | bool | force silly options, such as tiny durations                                     |
| renewBefore | ms   | Check domains that are scheduled to renew before the given date in milliseconds |

<!--
| issuedBefore  | ms   | Check domains issued before the given date in milliseconds                      |
| expiresBefore | ms   | Check domains that expire before the given date in milliseconds                 |
-->

</details>

<details>
<summary>Greenlock#remove({ subject })</summary>

## Greenlock#manager.remove()

To stop certificates from being renewed, you must remove them.

If you are implementing your own `manager` callbacks, I recommend that you mark them as deleted
(i.e. `deleted_at` in your database) rather than actually removing them. Just in case.

```js
gl.remove({
    subject: 'example.com'
}).then(function(siteConfig) {
    // save the old site config elsewhere, just in case you need it again
});
```

| Parameter | Description                                            |
| --------- | ------------------------------------------------------ |
| subject   | the first domain on, and identifier of the certificate |

</details>

<details>
<summary>Events</summary>

Most of the events bubble from ACME.js.

See https://git.rootprojects.org/root/acme.js#api-overview

_TODO_: document the greenlock-specific events.

</details>

<!--

<details>
<summary>Node.js</summary>
-->

# Install

Greenlock comes with reasonable defaults but when you install it,
you should also install any plugins that you need.

```bash
npm install --save @root/greenlock@v4
npm install --save @greenlock/manager
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

# Easy to Customize

<!-- greenlock-manager-test => greenlock-manager-custom -->

<!--
- [greenlock.js/examples/](https://git.rootprojects.org/root/greenlock.js/src/branch/master/examples)
-->

<details>
<summary>SSL Cert & Domain Management</summary>

## SSL Certificate & Domain Management

Full Docs: https://git.rootprojects.org/root/greenlock-manager-test.js

This is what keeps the mapping of domains <-> certificates.
In many cases it will interact with the same database as the Key & Cert Store, and probably the code as well.

-   set({ subject, altnames, renewAt })
-   find({ servernames, renewBefore })
    ```js
    // should return a list of site configs:
    [
        {
            subject: 'example.com',
            altnames: ['example.com', 'exampleapi.com'],
            renewAt: 1575197231760
        },
        {
            subject: '*.example.com',
            altnames: ['*.example.com'],
            renewAt: 1575197231760,
            challenges: {
                'dns-01': {
                    module: 'acme-dns-01-dnsimple',
                    apikey: 'xxxx'
                }
            }
        }
    ];
    ```
-   remove({ subject })
-   defaults() (both getter and setter)
    ```json
    {
        "subscriberEmail": "jane@example.com",
        "agreeToTerms": true,
        "challenges": {
            "http-01": {
                "module": "acme-http-01-standalone"
            }
        }
    }
    ```

</details>

<details>
<summary>Key & Cert Storage</summary>

## Key and Certificate Store

Full Docs: https://git.rootprojects.org/root/greenlock-store-test.js

This set of callbacks update your service with new certificates and keypairs.

### Account Keys (JWK)

(though typically you only have one account key - because you only have one subscriber email)

-   accounts.setKeypair({ email, keypair })
-   accounts.checkKeypair({ email })

### Certificate Keys (JWK + PEM)

(typically you have one for each set of domains, and each load balancer)

-   certificates.setKeypair({ subject, keypair })
-   certificates.checkKeypair({ subject })
    (these are fine to implement the same as above, swapping subject/email)

### Certificate PEMs

-   certificates.set({ subject, pems })
-   certificates.check({ subject })

</details>

<details>
<summary>ACME HTTP-01 Challenges</summary>

## ACME Challenge HTTP-01 Strategies

Full Docs: https://git.rootprojects.org/root/acme-http-01-test.js

This validation and authorization strategy is done over plain HTTP on Port 80.

These are used to set files containing tokens that Let's Encrypt will fetch from each domain
before authorizing a certificate.

**NOT for Wildcards**.

-   init({ request })
-   set({ challenge: { type, token, keyAuthorization, challengeUrl } })
-   get({ challenge: { type, token } })
-   remove({ challenge: { type, token } })

<!--
TODO: getAcmeHttp01Challenge
-->

</details>

<details>
<summary>ACME DNS-01 Challenges</summary>

## ACME Challenge DNS-01 Strategies

Full Docs https://git.rootprojects.org/root/acme-dns-01-test.js

This validation and authorization strategy is done over DNS on UDP and TCP ports 53.

**For Wildcards**

These are used to set TXT records containing tokens that Let's Encrypt will fetch for
each domain before authorizing a certificate.

-   init({ request })
-   zones()
-   set({ challenge: { type, dnsZone, dnsPrefix, dnsHost, keyAuthorizationDigest } })
-   get({ challenge: { type, dnsZone, dnsPrefix, dnsHost } })
-   remove({ challenge: { type, dnsZone, dnsPrefix, dnsHost } })

</details>

<details>
<summary>Notes on HTTP-01 &amp; DNS-01 Integrations</summary>

## Notes on HTTP-01 &amp; DNS-01 Integrations

For Public Web Servers running on a VPS, the **default HTTP-01 challenge plugin**
will work just fine, for most people.

However, for environments that cannot be verified via public HTTP, such as

-   **Wildcard Certificates**
-   **IoT Environments**
-   **Enterprise On-Prem**
-   **Private Networks**

Greenlock provides an easy way to integrate Let's Encrypt with your existing services
through a variety of **DNS-01** challenges.

### Why not use dns01 for everything?

Typically file propagation is faster and more reliably than DNS propagation.
Therefore, http-01 will be preferred to dns-01 except when wildcards or **private domains** are in use.

http-01 will only be supplied as a defaut if no other challenge is provided.

</details>

# Ready-made Integrations

Greenlock Express integrates between Let's Encrypt's ACME Challenges and many popular services.

| Type        | Service                                                                             | Plugin                   |
| ----------- | ----------------------------------------------------------------------------------- | ------------------------ |
| dns-01      | CloudFlare                                                                          | acme-dns-01-cloudflare   |
| dns-01      | [Digital Ocean](https://git.rootprojects.org/root/acme-dns-01-digitalocean.js)      | acme-dns-01-digitalocean |
| dns-01      | [DNSimple](https://git.rootprojects.org/root/acme-dns-01-dnsimple.js)               | acme-dns-01-dnsimple     |
| dns-01      | [DuckDNS](https://git.rootprojects.org/root/acme-dns-01-duckdns.js)                 | acme-dns-01-duckdns      |
| http-01     | File System / [Web Root](https://git.rootprojects.org/root/acme-http-01-webroot.js) | acme-http-01-webroot     |
| dns-01      | [GoDaddy](https://git.rootprojects.org/root/acme-dns-01-godaddy.js)                 | acme-dns-01-godaddy      |
| dns-01      | [Gandi](https://git.rootprojects.org/root/acme-dns-01-gandi.js)                     | acme-dns-01-gandi        |
| dns-01      | [NameCheap](https://git.rootprojects.org/root/acme-dns-01-namecheap.js)             | acme-dns-01-namecheap    |
| dns-01      | [Name&#46;com](https://git.rootprojects.org/root/acme-dns-01-namedotcom.js)         | acme-dns-01-namedotcom   |
| dns-01      | Route53 (AWS)                                                                       | acme-dns-01-route53      |
| http-01     | S3 (AWS, Digital Ocean, Scaleway)                                                   | acme-http-01-s3          |
| dns-01      | [Vultr](https://git.rootprojects.org/root/acme-dns-01-vultr.js)                     | acme-dns-01-vultr        |
| dns-01      | [Build your own](https://git.rootprojects.org/root/acme-dns-01-test.js)             | acme-dns-01-test         |
| http-01     | [Build your own](https://git.rootprojects.org/root/acme-http-01-test.js)            | acme-http-01-test        |
| tls-alpn-01 | [Contact us](mailto:support@therootcompany.com)                                     | -                        |

Search `acme-http-01-` or `acme-dns-01-` on npm to find more.

# Commercial Support

Do you need...

-   training?
-   specific features?
-   different integrations?
-   bugfixes, on _your_ timeline?
-   custom code, built by experts?
-   commercial support and licensing?

You're welcome to [contact us](mailto:aj@therootcompany.com) in regards to IoT, On-Prem,
Enterprise, and Internal installations, integrations, and deployments.

We have both commercial support and commercial licensing available.

We also offer consulting for all-things-ACME and Let's Encrypt.

# Legal &amp; Rules of the Road

Greenlock&trade; is a [trademark](https://rootprojects.org/legal/#trademark) of AJ ONeal

The rule of thumb is "attribute, but don't confuse". For example:

> Built with [Greenlock Express](https://git.rootprojects.org/root/greenlock.js) (a [Root](https://rootprojects.org) project).

Please [contact us](mailto:aj@therootcompany.com) if you have any questions in regards to our trademark,
attribution, and/or visible source policies. We want to build great software and a great community.

[Greenlock&trade;](https://git.rootprojects.org/root/greenlock.js) |
MPL-2.0 |
[Terms of Use](https://therootcompany.com/legal/#terms) |
[Privacy Policy](https://therootcompany.com/legal/#privacy)
