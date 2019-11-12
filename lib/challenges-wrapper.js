'use strict';

var Greenlock = require('../');

module.exports.wrap = function(greenlock) {
    greenlock.challenges = {};
    greenlock.challenges.get = async function(chall) {
        // TODO pick one and warn on the others
        // (just here due to some backwards compat issues with early v3 plugins)
        var servername =
            chall.servername ||
            chall.altname ||
            (chall.identifier && chall.identifier.value);

        // TODO some sort of caching to prevent database hits?
        var site = await greenlock._config({ servername: servername });
        if (!site) {
            return null;
        }

        // Hmm... this _should_ be impossible
        if (!site.challenges || !site.challenges['http-01']) {
            var copy = JSON.parse(JSON.stringify(site));
            sanitizeCopiedConf(copy);
            sanitizeCopiedConf(copy.store);
            if (site.challenges) {
                sanitizeCopiedConf(copy.challenges['http-01']);
                sanitizeCopiedConf(copy.challenges['dns-01']);
                sanitizeCopiedConf(copy.challenges['tls-alpn-01']);
            }
            console.warn('[Bug] Please report this error:');
            console.warn(
                '\terror: http-01 challenge requested, but not even a default http-01 config exists'
            );
            console.warn('\tservername:', JSON.stringify(servername));
            console.warn('\tsite:', JSON.stringify(copy));
            return null;
        }

        var plugin = await Greenlock._loadChallenge(site.challenges, 'http-01');
        if (!plugin) {
            return null;
        }

        var keyAuth;
        var keyAuthDigest;
        var result = await plugin.get({
            challenge: {
                type: chall.type,
                //hostname: chall.servername,
                altname: chall.servername,
                identifier: { value: chall.servername },
                token: chall.token
            }
        });
        if (result) {
            // backwards compat that shouldn't be dropped
            // because new v3 modules had to do this to be
            // backwards compatible with Greenlock v2.7 at
            // the time.
            if (result.challenge) {
                result = result.challenge;
            }
            keyAuth = result.keyAuthorization;
            keyAuthDigest = result.keyAuthorizationDigest;
        }

        if (/dns/.test(chall.type)) {
            return { keyAuthorizationDigest: keyAuthDigest };
        }

        return { keyAuthorization: keyAuth };
    };
};

function sanitizeCopiedConf(copy) {
    if (!copy) {
        return;
    }

    Object.keys(copy).forEach(function(k) {
        if (/(api|key|token)/i.test(k) && 'string' === typeof copy[k]) {
            copy[k] = '**redacted**';
        }
    });

    return copy;
}
