'use strict';

function addCommunityMember(opts) {
  // { name, version, email, domains, action, communityMember, telemetry }
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
    var os = require('os');
    var data = {
      address: opts.email
      // greenlock-security is transactional and security only
    , list: opts.communityMember ? (opts.name + '@ppl.family') : 'greenlock-security@ppl.family'
    , action: opts.action // reg | renew
    , package: opts.name
      // hashed for privacy, but so we can still get some telemetry and inform users
      // if abnormal things are happening (like several registrations for the same domain each day)
    , domain: (opts.domains||[]).map(function (d) {
        return require('crypto').createHash('sha1').update(d).digest('base64')
          .replace(/\//g, '_').replace(/\+/g, '-').replace(/=/g, '');
      }).join(',')
    };
    if (false !== opts.telemetry) {
      data.arch = process.arch || os.arch();
      data.platform = process.platform || os.platform();
      data.release = os.release();
      data.version = opts.version;
      data.node = process.version;
    }
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
