'use strict';

var utils = require('./utils.js');
var cert = { subject: 'example.com', altnames: ['*.bar.com', 'foo.net'] };
if (utils.certHasDomain(cert, 'bad.com')) {
	throw new Error('allowed bad domain');
}
if (!utils.certHasDomain(cert, 'example.com')) {
	throw new Error('missed subject');
}
if (utils.certHasDomain(cert, 'bar.com')) {
	throw new Error('allowed bad (missing) sub');
}
if (!utils.certHasDomain(cert, 'foo.bar.com')) {
	throw new Error("didn't allow valid wildcarded-domain");
}
if (utils.certHasDomain(cert, 'dub.foo.bar.com')) {
	throw new Error('allowed sub-sub domain');
}
if (!utils.certHasDomain(cert, 'foo.net')) {
	throw new Error('missed altname');
}

console.info('PASSED');
