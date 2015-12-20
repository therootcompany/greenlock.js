'use strict';

var PromiseA = require('bluebird');
var pyconf = PromiseA.promisifyAll(require('pyconf'));
var mkdirpAsync = PromiseA.promisify(require('mkdirp'));
var path = require('path');

pyconf.readFileAsync(path.join(__dirname, 'lib', 'renewal.conf.tpl')).then(function (obj) {
  var domains = ['example.com', 'www.example.com'];
  var webrootPath = '/tmp/www/example.com';

  console.log(obj);

  var keys = obj.__keys;
  var lines = obj.__lines;

  obj.__keys = null;
  obj.__lines = null;

  var updates = {
    account: 'ACCOUNT_ID'

  , cert: 'CERT_PATH'
  , privkey: 'PRIVATEKEY_PATH'
  , configDir: 'CONFIG_DIR'
  , tos: true
  , http01Port: 80
  , domains: domains
  };

  // final section is completely dynamic
  // :hostname = :webroot_path
  domains.forEach(function (hostname) {
    updates[hostname] = webrootPath;
  });

  // must write back to the original object or
  // annotations will be lost
  Object.keys(updates).forEach(function (key) {
    obj[key] = updates[key];
  });

  var renewalPath = '/tmp/letsencrypt/renewal/example.com.conf';
  return mkdirpAsync(path.dirname(renewalPath)).then(function () {
    console.log(obj);
    obj.__keys = keys;
    obj.__lines = lines;
    return pyconf.writeFileAsync(renewalPath, obj);
  });
});
