'use strict';

var certInfo = require('../lib/cert-info.js');

var c = certInfo.testGetCertInfo();

console.info('');

console.info(c.notBefore.value);
console.info(new Date(c.notBefore.value).valueOf());

console.info('');

console.info(c.notAfter.value);
console.info(new Date(c.notAfter.value).valueOf());

console.info('');

console.info('');
console.info('If we got values at all, it must have passed.');
console.info('');
