'use strict';

var http = require('http');
var https = require('http2');
var greenlock = require('../greenlock.js').create({
	maintainerEmail: 'jon@example.com'
});

function app(req, res) {
	res.end('Hello, Encrypted World!');
}

http.createServer(greenlock.plainMiddleware()).listen(8080);
https
	.createServer(greenlock.tlsOptions, greenlock.secureMiddleware(app))
	.listen(8443);
