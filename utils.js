'use strict';

var re = /^[a-zA-Z0-9\.\-]+$/;
var punycode = require('punycode');

var utils = module.exports;

utils.isValidDomain = function (domain) {
  if (re.test(domain)) {
    return domain;
  }

  domain = punycode.toASCII(domain);

  if (re.test(domain)) {
    return domain;
  }

  return '';
};
