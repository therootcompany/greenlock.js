#!/usr/bin/env node
'use strict';

var args = process.argv.slice(2);
console.log(args);
if ('certonly' === args[0]) {
	require('./certonly.js');
	return;
}
