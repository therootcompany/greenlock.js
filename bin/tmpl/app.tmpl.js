'use strict';

// Here's a vanilla HTTP app to start,
// but feel free to replace it with Express, Koa, etc
var app = function(req, res) {
    res.end('Hello, Encrypted World!');
};

module.exports = app;
