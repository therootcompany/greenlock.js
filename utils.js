'use strict';

var U = module.exports;

var promisify = require('util').promisify;
//var resolveSoa = promisify(require('dns').resolveSoa);
var resolveMx = promisify(require('dns').resolveMx);
var punycode = require('punycode');
var Keypairs = require('@root/keypairs');
// TODO move to @root
var certParser = require('cert-info');

U._parseDuration = function(str) {
    if ('number' === typeof str) {
        return str;
    }

    var pattern = /^(\-?\d+(\.\d+)?)([wdhms]|ms)$/;
    var matches = str.match(pattern);
    if (!matches || !matches[0]) {
        throw new Error('invalid duration string: ' + str);
    }

    var n = parseInt(matches[1], 10);
    var unit = matches[3];

    switch (unit) {
        case 'w':
            n *= 7;
        /*falls through*/
        case 'd':
            n *= 24;
        /*falls through*/
        case 'h':
            n *= 60;
        /*falls through*/
        case 'm':
            n *= 60;
        /*falls through*/
        case 's':
            n *= 1000;
        /*falls through*/
        case 'ms':
            n *= 1; // for completeness
    }

    return n;
};

U._encodeName = function(str) {
    return punycode.toASCII(str.toLowerCase(str));
};

U._validName = function(str) {
    // A quick check of the 38 and two ½ valid characters
    // 253 char max full domain, including dots
    // 63 char max each label segment
    // Note: * is not allowed, but it's allowable here
    // Note: _ (underscore) is only allowed for "domain names", not "hostnames"
    // Note: - (hyphen) is not allowed as a first character (but a number is)
    return (
        /^(\*\.)?[a-z0-9_\.\-]+\.[a-z0-9_\.\-]+$/.test(str) &&
        str.length < 254 &&
        str.split('.').every(function(label) {
            return label.length > 0 && label.length < 64;
        })
    );
};

U._validMx = function(email) {
    var host = email.split('@').slice(1)[0];
    // try twice, just because DNS hiccups sometimes
    // Note: we don't care if the domain exists, just that it *can* exist
    return resolveMx(host).catch(function() {
        return U._timeout(1000).then(function() {
            return resolveMx(host);
        });
    });
};

// should be called after _validName
U._validDomain = function(str) {
    // TODO use @root/dns (currently dns-suite)
    // because node's dns can't read Authority records
    return Promise.resolve(str);
    /*
	// try twice, just because DNS hiccups sometimes
	// Note: we don't care if the domain exists, just that it *can* exist
	return resolveSoa(str).catch(function() {
		return U._timeout(1000).then(function() {
			return resolveSoa(str);
		});
	});
  */
};

// foo.example.com and *.example.com overlap
// should be called after _validName
// (which enforces *. or no *)
U._uniqueNames = function(altnames) {
    var dups = {};
    var wilds = {};
    if (
        altnames.some(function(w) {
            if ('*.' !== w.slice(0, 2)) {
                return;
            }
            if (wilds[w]) {
                return true;
            }
            wilds[w] = true;
        })
    ) {
        return false;
    }

    return altnames.every(function(name) {
        var w;
        if ('*.' !== name.slice(0, 2)) {
            w =
                '*.' +
                name
                    .split('.')
                    .slice(1)
                    .join('.');
        } else {
            return true;
        }

        if (!dups[name] && !dups[w]) {
            dups[name] = true;
            return true;
        }
    });
};

U._timeout = function(d) {
    return new Promise(function(resolve) {
        setTimeout(resolve, d);
    });
};

U._genKeypair = function(keyType) {
    var keyopts;
    var len = parseInt(keyType.replace(/.*?(\d)/, '$1') || 0, 10);
    if (/RSA/.test(keyType)) {
        keyopts = {
            kty: 'RSA',
            modulusLength: len || 2048
        };
    } else if (/^(EC|P\-?\d)/i.test(keyType)) {
        keyopts = {
            kty: 'EC',
            namedCurve: 'P-' + (len || 256)
        };
    } else {
        // TODO put in ./errors.js
        throw new Error('invalid key type: ' + keyType);
    }

    return Keypairs.generate(keyopts).then(function(pair) {
        return U._jwkToSet(pair.private);
    });
};

// TODO use ACME._importKeypair ??
U._importKeypair = function(keypair) {
    // this should import all formats equally well:
    // 'object' (JWK), 'string' (private key pem), kp.privateKeyPem, kp.privateKeyJwk
    if (keypair.private || keypair.d) {
        return U._jwkToSet(keypair.private || keypair);
    }
    if (keypair.privateKeyJwk) {
        return U._jwkToSet(keypair.privateKeyJwk);
    }

    if ('string' !== typeof keypair && !keypair.privateKeyPem) {
        // TODO put in errors
        throw new Error('missing private key');
    }

    return Keypairs.import({ pem: keypair.privateKeyPem || keypair }).then(
        function(priv) {
            if (!priv.d) {
                throw new Error('missing private key');
            }
            return U._jwkToSet(priv);
        }
    );
};

U._jwkToSet = function(jwk) {
    var keypair = {
        privateKeyJwk: jwk
    };
    return Promise.all([
        Keypairs.export({
            jwk: jwk,
            encoding: 'pem'
        }).then(function(pem) {
            keypair.privateKeyPem = pem;
        }),
        Keypairs.export({
            jwk: jwk,
            encoding: 'pem',
            public: true
        }).then(function(pem) {
            keypair.publicKeyPem = pem;
        }),
        Keypairs.publish({
            jwk: jwk
        }).then(function(pub) {
            keypair.publicKeyJwk = pub;
        })
    ]).then(function() {
        return keypair;
    });
};

U._attachCertInfo = function(results) {
    var certInfo = certParser.info(results.cert);

    // subject, altnames, issuedAt, expiresAt
    Object.keys(certInfo).forEach(function(key) {
        results[key] = certInfo[key];
    });

    return results;
};

U._certHasDomain = function(certInfo, _domain) {
    var names = (certInfo.altnames || []).slice(0);
    return names.some(function(name) {
        var domain = _domain.toLowerCase();
        name = name.toLowerCase();
        if ('*.' === name.substr(0, 2)) {
            name = name.substr(2);
            domain = domain
                .split('.')
                .slice(1)
                .join('.');
        }
        return name === domain;
    });
};

// a bit heavy to be labeled 'utils'... perhaps 'common' would be better?
U._getOrCreateKeypair = function(db, subject, query, keyType, mustExist) {
    var exists = false;
    return db
        .checkKeypair(query)
        .then(function(kp) {
            if (kp) {
                exists = true;
                return U._importKeypair(kp);
            }

            if (mustExist) {
                // TODO put in errors
                throw new Error(
                    'required keypair not found: ' +
                        (subject || '') +
                        ' ' +
                        JSON.stringify(query)
                );
            }

            return U._genKeypair(keyType);
        })
        .then(function(keypair) {
            return { exists: exists, keypair: keypair };
        });
};

U._getKeypair = function(db, subject, query) {
    return U._getOrCreateKeypair(db, subject, query, '', true).then(function(
        result
    ) {
        return result.keypair;
    });
};
