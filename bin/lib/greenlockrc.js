'use strict';

// TODO how to handle path differences when run from npx vs when required by greenlock?

var promisify = require('util').promisify;
var fs = require('fs');
var readFile = promisify(fs.readFile);
var writeFile = promisify(fs.writeFile);
var chmodFile = promisify(fs.chmod);
var path = require('path');

function saveFile(rcpath, data, enc) {
    // because this may have a database url or some such
    return writeFile(rcpath, data, enc).then(function() {
        return chmodFile(rcpath, parseInt('0600', 8));
    });
}

module.exports = async function(pkgpath, manager, rc) {
    // TODO when run from package
    // Run from the package root (assumed) or exit
    var pkgdir = path.dirname(pkgpath);
    var rcpath = path.join(pkgdir, '.greenlockrc');
    var created = false;

    try {
        require(pkgpath);
    } catch (e) {
        console.error(
            'npx greenlock must be run from the package root (where package.json is)'
        );
        process.exit(1);
    }

    if (manager) {
        if ('.' === manager[0]) {
            manager = path.resolve(pkgdir, manager);
        }
        try {
            require(manager);
        } catch (e) {
            console.error('npx greenlock must be run from the package root');
            process.exit(1);
        }
    }

    var _data = await readFile(rcpath, 'utf8').catch(function(err) {
        if ('ENOENT' !== err.code) {
            throw err;
        }
        console.info('Creating ' + rcpath);
        created = true;
        var data = '{}';
        return saveFile(rcpath, data, 'utf8').then(function() {
            return data;
        });
    });

    var changed;
    var _rc;
    try {
        _rc = JSON.parse(_data);
    } catch (e) {
        console.error("couldn't parse " + rcpath, _data);
        console.error('(perhaps you should just delete it and try again?)');
        process.exit(1);
    }

    if (manager) {
        if (!_rc.manager) {
            _rc.manager = manager;
        }
        if (_rc.manager !== manager) {
            console.info('Switching manager:');
            var older = _rc.manager;
            var newer = manager;
            if ('/' === older[0]) {
                older = path.relative(pkgdir, older);
            }
            if ('/' === newer[0]) {
                newer = path.relative(pkgdir, newer);
            }
            console.info('\told: ' + older);
            console.info('\tnew: ' + newer);
            changed = true;
        }
    }

    if (rc) {
        changed = true;
        Object.keys(rc).forEach(function(k) {
            _rc[k] = rc[k];
        });
    }

    if (!_rc.manager) {
        changed = true;
        _rc.manager = 'greenlock-manager-fs';
        console.info('Using default manager ' + _rc.manager);
    }

    if (!changed) {
        return _rc;
    }

    var data = JSON.stringify(_rc, null, 2);
    if (created) {
        console.info('Wrote ' + rcpath);
    }
    return saveFile(rcpath, data, 'utf8').then(function() {
        return _rc;
    });
};
