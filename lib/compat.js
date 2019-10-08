'use strict';

function requireBluebird() {
	try {
		return require('bluebird');
	} catch (e) {
		console.error('');
		console.error(
			"DON'T PANIC. You're running an old version of node with incomplete Promise support."
		);
		console.error('EASY FIX: `npm install --save bluebird`');
		console.error('');
		throw e;
	}
}

if ('undefined' === typeof Promise) {
	global.Promise = requireBluebird();
}

if ('function' !== typeof require('util').promisify) {
	require('util').promisify = requireBluebird().promisify;
}
