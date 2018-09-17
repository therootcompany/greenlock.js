'use strict';

function addCommunityMember(pkg, action, email, domains, communityMember) {
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
    var data = {
      address: email
      // greenlock-security is transactional and security only
    , list: communityMember ? (pkg + '@ppl.family') : 'greenlock-security@ppl.family'
    , action: action // reg | renew
    , package: pkg
      // hashed for privacy, but so we can still get some telemetry and inform users
      // if abnormal things are happening (like several registrations for the same domain each day)
    , domain: (domains||[]).map(function (d) {
        return require('crypto').createHash('sha1').update(d).digest('base64')
          .replace(/\//g, '_').replace(/\+/g, '-').replace(/=/g, '');
      }).join(',')
    };
    console.log(JSON.stringify(data, 2, null));
    req.write(JSON.stringify(data, 2, null));
    req.end();
  }, 50);
}

module.exports.add = addCommunityMember;

if (require.main === module) {
  //addCommunityMember('greenlock-express.js', 'reg', 'coolaj86+test42@gmail.com', ['coolaj86.com'], true);
  //addCommunityMember('greenlock.js', 'reg', 'coolaj86+test37@gmail.com', ['oneal.im'], false);
  //addCommunityMember('greenlock.js', 'reg', 'coolaj86+test11@gmail.com', ['ppl.family'], true);
}
