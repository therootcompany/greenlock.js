'use strict';

var path = require('path');

var config = {

  plainPort: 80
, tlsPort: 5001 // 5001 for testing, normally 443
, tlsKey: require('localhost.daplie.com-certificates').key
, tlsCert: require('localhost.daplie.com-certificates').cert


, le: {
    webrootPath: path.join(__dirname, '..', 'tests', 'acme-challenge')
  , fullchainTpl: '/live/:hostname/fullchain.pem'
  , privkeyTpl: '/live/:hostname/privkey.pem'
  , configDir: path.join(__dirname, '..', 'tests', 'letsencrypt.config')

    // these are specific to the python client and won't be needed with the purejs library
  , logsDir: path.join(__dirname, '..', 'tests', 'letsencrypt.logs')
  , workDir: path.join(__dirname, '..', 'tests', 'letsencrypt.work')
  }

};

module.exports = config;
