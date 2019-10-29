'use strict';

require('dotenv').config();

var path = require('path');
var Greenlock = require('../');

var subject = process.env.BASE_DOMAIN;
var altnames = [subject, '*.' + subject, 'foo.bar.' + subject];
var email = process.env.SUBSCRIBER_EMAIL;
var challenge = JSON.parse(process.env.CHALLENGE_OPTIONS);
challenge.module = process.env.CHALLENGE_PLUGIN;

var greenlock = Greenlock.create({
	agreeTos: true,
	maintainerEmail: email,
	staging: true,
	manager: path.join(__dirname, 'manager.js'),
	challenges: {
		'dns-01': challenge
	}
	//configFile: '~/.config/greenlock/certs.json',
	//challenges: challenges,
	//store: args.storeOpts,
	//renewOffset: args.renewOffset || '30d',
	//renewStagger: '1d'
});

greenlock
	.add({
		subject: subject,
		altnames: altnames,
		subscriberEmail: email
	})
	.then(function() {
		return greenlock.renew().then(function(pems) {
			console.info(pems);
		});
	})
	.catch(function(e) {
		console.error('yo', e.code);
		console.error(e);
	});
