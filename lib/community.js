'use strict';

function addCommunityMember(pkg, email, domains) {
  setTimeout(function () {
    var https = require('https');
    var req = https.request({
      hostname: 'api.ppl.family'
    , port: 443
    , path: '/api/ppl.family/public/list'
    , method: 'POST'
    , headers: {
        'Content-Type': 'application/json'
      }
    }, function (err, resp) {
      if (err) { return; }
      resp.on('data', function () {});
    });
    req.write(JSON.stringify({
      address: email
    , comment: (pkg || 'community') + '  member w/ ' + (domains||[]).map(function (d) {
        return require('crypto').createHash('sha1').update(d).digest('base64')
          .replace(/\//g, '_').replace(/\+/g, '-').replace(/=/g, '');
      }).join(',')
    }));
    req.end();
  }, 50);
}

module.exports.add = addCommunityMember;
