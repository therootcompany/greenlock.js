'use strict';

var utils = require('./utils');

function log(debug) {
  if (debug) {
    var args = Array.prototype.slice.call(arguments);
    args.shift();
    args.unshift("[le/lib/middleware.js]");
    console.log.apply(console, args);
  }
}

module.exports.create = function (le) {
  if (!le.challenge || !le.challenge.get) {
    throw new Error("middleware requires challenge plugin with get method");
  }

  log(le.debug, "created middleware");
  return function () {
    var prefix = le.acmeChallengePrefix; // /.well-known/acme-challenge/:token

    return function (req, res, next) {
      if (0 !== req.url.indexOf(prefix)) {
        log(le.debug, "no match, skipping middleware");
        next();
        return;
      }

      log(le.debug, "this must be tinder, 'cuz it's a match!");

      var token = req.url.slice(prefix.length);
      var hostname = req.hostname || (req.headers.host || '').toLowerCase().replace(/:*/, '');

      log(le.debug, "hostname", hostname, "token", token);

      var copy = utils.merge({}, le);
      copy = utils.tplCopy(copy);

      // TODO tpl copy?
      le.challenge.get(copy, hostname, token, function (err, secret) {
        if (err || !token) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end('{ "error": { "message": "Error: These aren\'t the tokens you\'re looking for. Move along." } }');
          return;
        }

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(secret);
      });
    };
  };
};
