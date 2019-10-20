'use strict';

var Greenlock = module.exports;

Greenlock.server = function (opts) {
  var opts = Greenlock.create(opts);

	opts.plainMiddleware = function(req, res) {
		return Greenlock._plainMiddleware(opts, req, res);
	};

	opts.secureMiddleware = function(req, res) {
		return Greenlock._secureMiddleware(opts, req, res);
	};

	opts.tlsOptions = {
		SNICallback: function(servername, cb) {
			return Greenlock._sniCallback(opts, servername)
				.then(function() {
					cb(null);
				})
				.catch(function(err) {
					cb(err);
				});
		}
	};

  return opts;
};

// must handle http-01 challenges
Greenlock._plainMiddleware = function(opts, req, res) {};

// should check for domain fronting
Greenlock._secureMiddleware = function(opts, req, res) {};

// should check to see if domain is allowed, and if domain should be renewed
// manage should be able to clear the internal cache
Greenlock._sniCallback = function(opts, servername) {};

Greenlock._onSniRejection(function () {
});
