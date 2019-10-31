'use strict';

require('dotenv').config();

var Greenlock = require('../');

var subject = process.env.BASE_DOMAIN;
var altnames = [subject, '*.' + subject, 'foo.bar.' + subject];
var email = process.env.SUBSCRIBER_EMAIL;
var challenge = JSON.parse(process.env.CHALLENGE_OPTIONS);
challenge.module = process.env.CHALLENGE_PLUGIN;

var greenlock = Greenlock.create({
    packageAgent: 'Greenlock_Test/v0',
    maintainerEmail: email,
    staging: true,
    manager: require('greenlock-manager-fs').create({
        //configFile: '~/.config/greenlock/certs.json',
    })
});

greenlock.manager
    .defaults({
        agreeToTerms: true,
        subscriberEmail: email,
        challenges: {
            'dns-01': challenge
        }
        //store: args.storeOpts,
        //renewOffset: args.renewOffset || '30d',
        //renewStagger: '1d'
    })
    .then(function() {
        return greenlock
            .add({
                subject: subject,
                altnames: altnames,
                subscriberEmail: email
            })
            .then(function() {
                return greenlock
                    .get({ servername: subject })
                    .then(function(pems) {
                        if (pems && pems.privkey && pems.cert && pems.chain) {
                            console.info('Success');
                        }
                        //console.log(pems);
                    });
            });
    })
    .catch(function(e) {
        console.error('Big bad error:', e.code);
        console.error(e);
    });
