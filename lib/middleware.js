'use strict';

module.exports = function (le) {
  return function () {
    var prefix = le.acmeChallengePrefix; // /.well-known/acme-challenge/:token

    return function (req, res, next) {
      if (0 !== req.url.indexOf(prefix)) {
        next();
        return;
      }

      var key = req.url.slice(prefix.length);
      var hostname = req.hostname || (req.headers.host || '').toLowerCase().replace(/:*/, '');

      // TODO tpl copy?
      le.challenger.getAsync(le, hostname, key).then(function (token) {
        if (!token) {
          res.status = 404;
          res.send("Error: These aren't the tokens you're looking for. Move along.");
          return;
        }

        res.send(token);
      }, function (/*err*/) {
        res.status = 404;
        res.send("Error: These aren't the tokens you're looking for. Move along.");
      });
    };
  };
};
