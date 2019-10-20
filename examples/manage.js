'use strict';

// tradeoff - lazy load certs vs DOS invalid sni

var Manager = module.exports;

var Cache = {};

Manager.create = function(conf) {
	var domains = conf.domains;
	var manager = {};

	// { servername, wildname }
	manager.getSubject = function(opts) {
		if (
			!opts.domains.includes(opts.domain) &&
			!opts.domains.includes(opts.wildname)
		) {
			throw new Error('not a registered domain');
		}
		return opts.domains[0];
	};

	manager.add = function() {};

	// { servername, wildname }
	manager.configure = function(opts) {};

	// { servername }
	manager._contexts = {};
};

var manager = Manager.create({
	domains: ['example.com', '*.example.com']
});

Cache.getTlsContext = function(servername) {
	// TODO exponential fallback certificate renewal
	if (Cache._contexts[servername]) {
		// may be a context, or a promise for a context
		return Cache._contexts[servername];
	}

	var wildname =
		'*.' +
		(servername || '')
			.split('.')
			.slice(1)
			.join('.');

	var opts = {
		servername: servername,
		domain: servername,
		wildname: wildname
	};
	manager._contexts[servername] = manager
		.orderCertificate(opts)
		.then(function() {})
		.catch(function(e) {});
};
