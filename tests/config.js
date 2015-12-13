'use strict';

var path = require('path');

module.exports = {
  server: "https://acme-staging.api.letsencrypt.org/directory"
, tlsSni01Port: 5001
, http01Port: 80
, webrootPath: path.join(__dirname, "acme-challenge")
, configDir: path.join(__dirname, "letsencrypt.config")
, workDir: path.join(__dirname, "letsencrypt.work")
, logsDir: path.join(__dirname, "letsencrypt.logs")
, allowedDomains: ['example.com']
};
