#!/usr/bin/env node
'use strict';

var args = process.argv.slice(2);
//console.log(args);
//['certonly', 'add', 'config', 'defaults', 'remove']
if ('certonly' === args[0]) {
    require('./certonly.js');
    return;
}

console.error("command not yet implemented");
process.exit();
