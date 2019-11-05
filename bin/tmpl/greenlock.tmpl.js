'use strict';

module.exports = require('greenlock').create(init());

function init() {
    // .greenlockrc defines which manager to use
    // (i.e. greenlock-manager-fs or greenlock-manager-cloud)
    var options = getGreenlockRc() || {};

    // name & version for ACME client user agent
    var pkg = require('./package.json');
    options.packageAgent = pkg.name + '/' + pkg.version;

    // contact for security and critical bug notices
    options.maintainerEmail = pkg.author;

    return options;
}

function getGreenlockRc() {
    // The RC file is also used by the (optional) CLI and (optional) Web GUI.
    // You are free to forego CLI and GUI support.
    var fs = require('fs');
    var path = require('path');
    var rcPath = path.join(__dirname, '.greenlockrc');
    var rc = fs.readFileSync(rcPath, 'utf8');
    rc = JSON.parse(rc);
    rc.packageRoot = __dirname;
}
