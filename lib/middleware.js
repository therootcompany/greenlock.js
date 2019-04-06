'use strict';

var utils = require('./utils');

function _log(debug) {
  if (debug) {
    var args = Array.prototype.slice.call(arguments);
    args.shift();
    args.unshift("[greenlock/lib/middleware.js]");
    console.log.apply(console, args);
  }
}

module.exports.create = function (gl) {
  if (!gl.challenges['http-01'] || !gl.challenges['http-01'].get) {
    throw new Error("middleware requires challenge plugin with get method");
  }
  var log = gl.log || _log;

  log(gl.debug, "created middleware");
  return function (_app) {
    if (_app && 'function' !== typeof _app) {
      throw new Error("use greenlock.middleware() or greenlock.middleware(function (req, res) {})");
    }
    var prefix = gl.acmeChallengePrefix || '/.well-known/acme-challenge/';

    return function (req, res, next) {
      if (0 !== req.url.indexOf(prefix)) {
        log(gl.debug, "no match, skipping middleware");
        if ('function' === typeof _app) {
          _app(req, res, next);
        }
        else if ('function' === typeof next) {
          next();
        }
        else {
          res.statusCode = 500;
          res.end("[500] Developer Error: app.use('/', greenlock.middleware()) or greenlock.middleware(app)");
        }
        return;
      }

      log(gl.debug, "this must be tinder, 'cuz it's a match!");

      var token = req.url.slice(prefix.length);
      var hostname = req.hostname || (req.headers.host || '').toLowerCase().replace(/:.*/, '');

      log(gl.debug, "hostname", hostname, "token", token);

      var copy = utils.merge({ domains: [ hostname ] }, gl);
      copy = utils.tplCopy(copy);
      copy.challenge = {};
      copy.challenge.type = 'http-01'; // obviously...
      copy.challenge.identifier = { type: 'dns', value: hostname };
      copy.challenge.wildcard = false;
      copy.challenge.token = token;
      copy.challenge.altname = hostname;

      function cb(opts) {
        var secret = opts.keyAuthorization || opts;
        if (secret && 'string' === typeof secret) {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(secret);
          return;
        }
        eb(new Error("couldn't retrieve keyAuthorization"));
        return;
      }
      function eb(/*err*/) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end('{ "error": { "message": "Error: These aren\'t the tokens you\'re looking for. Move along." } }');
        return;
      }
      function mb(err, result) {
        if (err) { eb(err); return; }
        cb(result);
      }

      var challenger = gl.challenges['http-01'].get;
      if (1 === challenger.length) {
        /*global Promise*/
        return Promise.resolve().then(function () {
          return gl.challenges['http-01'].get(copy);
        }).then(cb).catch(eb);
      } else if (2 === challenger.length) {
        gl.challenges['http-01'].get(copy, mb);
      } else {
        gl.challenges['http-01'].get(copy, hostname, token, mb);
      }

    };
  };
};
