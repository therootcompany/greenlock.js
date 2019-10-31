'use strict';

var E = module.exports;

function create(code, msg) {
    E[code] = function(ctx, msg2) {
        var err = new Error(msg);
        err.code = code;
        err.context = ctx;
        if (msg2) {
            err.message += ': ' + msg2;
        }
        /*
		Object.keys(extras).forEach(function(k) {
			if ('message' === k) {
				err.message += ': ' + extras[k];
			} else {
				err[k] = extras[k];
			}
		});
    */
        return err;
    };
}

// TODO open issues and link to them as the error url
create(
    'NO_MAINTAINER',
    'please supply `maintainerEmail` as a contact for security and critical bug notices'
);
create(
    'BAD_ORDER',
    'altnames should be in deterministic order, with subject as the first altname'
);
create('NO_SUBJECT', 'no certificate subject given');
create(
    'NO_SUBSCRIBER',
    'please supply `subscriberEmail` as a contact for failed renewal and certificate revocation'
);
create(
    'INVALID_SUBSCRIBER',
    '`subscriberEmail` is not a valid address, please check for typos'
);
create(
    'INVALID_HOSTNAME',
    'valid hostnames must be restricted to a-z0-9_.- and contain at least one "."'
);
create(
    'INVALID_DOMAIN',
    'one or more domains do not exist on public DNS SOA record'
);
create(
    'NOT_UNIQUE',
    'found duplicate domains, or a subdomain that overlaps a wildcard'
);

// exported for testing only
E._create = create;
