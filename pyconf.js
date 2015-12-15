'use strict';

var fs = require('fs');

function snakeCase(key) {
  if ('tlsSni01Port' === key) {
    return 'tls_sni_01_port';
  }
  /*
  else if ('http01Port' === key) {
    return 'http01-port';
  }
  */
  else {
    return key.replace(/([A-Z])/g, '_$1').toLowerCase();
  }
}

function uc(match, c) {
  return c.toUpperCase();
}

function camelCase(key) {
  return key.replace(/_([a-z0-9])/g, uc);
}

function parsePythonConf(str, cb) {
  var keys = {};
  var obj = {};
  var lines = str.split('\n');

  lines.forEach(function (line, i) {
    line = line.replace(/#.*/, '').trim();

    if (!line) { return; }

    var parts = line.trim().split('=');
    var pykey = parts.shift().trim();
    var key = camelCase(pykey);
    var val = parts.join('=');

    if ('True' === val) {
      val = true;
    }
    else if ('False' === val) {
      val = false;
    }
    else if ('None' === val) {
      val = null;
    }
    else if (/,/.test(val) && !/^"[^"]*"$/.test(val)) {
      val = val.split(',');
    }
    else if (/^[0-9]+$/.test(val)) {
      val = parseInt(val, 10);
    }

    obj[key] = val;
    if ('undefined' !== typeof keys[key]) {
      console.warn("unexpected duplicate key '" + key + "': '" + val + "'");
    }

    keys[key] = i;
  });

  // we want to be able to rewrite the file with comments, etc
  obj.__keys = keys;
  obj.__lines = lines;

  cb(null, obj);
}

function parsePythonConfFile(pathname, cb) {
  fs.readFile(pathname, 'utf8', function (err, text) {
    if (err) {
      cb(err);
      return;
    }

    parsePythonConf(text, cb);
  });
}

module.exports.parse = parsePythonConf;
module.exports.parseFile = parsePythonConfFile;

parsePythonConfFile('examples/renewal-example.com.conf', function (err, obj) {
  if (err) {
    console.error(err.stack);
    return;
  }

  console.log(obj);
});
