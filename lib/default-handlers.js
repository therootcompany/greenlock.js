'use strict';

module.exports.agreeToTerms = function (args, agree) {
  agree(args.agreeTos || args.agree);
};
