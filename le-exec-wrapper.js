'use strict';

var PromiseA = require('bluebird');
var spawn = require('child_process').spawn;

var letsencrypt = module.exports;

letsencrypt.parseOptions = function (text) {
  var options = {};
  var re = /--([a-z0-9\-]+)/g;
  var m;

  function uc(match, c) {
    return c.toUpperCase();
  }

  while ((m = re.exec(text))) {
    var key = m[1].replace(/-([a-z0-9])/g, uc);

    options[key] = true;
  }

  return options;
};

letsencrypt.opts = function (lebinpath, cb) {
  letsencrypt.exec(lebinpath, ['--help', 'all'], function (err, text) {
    if (err) {
      cb(err);
      return;
    }

    cb(null, Object.keys(letsencrypt.parseOptions(text)));
  });
};

letsencrypt.exec = function (lebinpath, args, opts, cb) {
  // TODO create and watch the directory for challenge callback
  if (opts.challengeCallback) {
    return PromiseA.reject({
      message: "challengeCallback not yet supported"
    });
  }

  var le = spawn(lebinpath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  var text = '';
  var errtext = '';
  var err;

  le.on('error', function (error) {
    err = error;
  });

  le.stdout.on('data', function (chunk) {
    text += chunk.toString('ascii');
  });

  le.stderr.on('data', function (chunk) {
    errtext += chunk.toString('ascii');
  });

  le.on('close', function (code, signal) {
    if (err) {
      cb(err);
      return;
    }

    if (errtext) {
      err = new Error(errtext);
      err.code = code;
      err.signal = signal;
      cb(err);
      return;
    }

    if (0 !== code) {
      err = new Error("exited with code '" + code + "'");
      err.code = code;
      err.signal = signal;
      cb(err);
      return;
    }

    cb(null, text);
  });
};

letsencrypt.objToArr = function (params, opts) {
  var args = {};
  var arr = [];

  Object.keys(opts).forEach(function (key) {
    var val = opts[key];

    if (!val && 0 !== val) {
      // non-zero value which is false, null, or otherwise falsey
      // falsey values should not be passed
      return;
    }

    if (!params.indexOf(key)) {
      // key is not recognized by the python client
      return;
    }

    if (Array.isArray(val)) {
      args[key] = opts[key].join(',');
    } else {
      args[key] = opts[key];
    }
  });

  Object.keys(args).forEach(function (key) {
    if ('tlsSni01Port' === key) {
      arr.push('--tls-sni-01-port');
    }
    else if ('http01Port' === key) {
      arr.push('--http-01-port');
    }
    else {
      arr.push('--' + key.replace(/([A-Z])/g, '-$1').toLowerCase());
    }

    if (true !== opts[key]) {
      // value is truthy, but not true (and falsies were weeded out above)
      arr.push(opts[key]);
    }
  });

  return arr;
};
