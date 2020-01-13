#!/usr/bin/env node
'use strict';

var args = process.argv.slice(2);
var arg0 = args[0];
//console.log(args);

var found = [
    'certonly',
    'add',
    'update',
    'config',
    'defaults',
    'remove',
    'init'
].some(function(k) {
    if (k === arg0) {
        require('./' + k);
        return true;
    }
});

if (!found) {
    console.error(arg0 + ': command not yet implemented');
    process.exit(1);
}
