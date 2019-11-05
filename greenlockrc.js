'use strict';

// TODO how to handle path differences when run from npx vs when required by greenlock?

var fs = require('fs');
var path = require('path');

function saveFile(rcpath, data, enc) {
    // because this may have a database url or some such
    fs.writeFileSync(rcpath, data, enc);
    return fs.chmodSync(rcpath, parseInt('0600', 8));
}

var GRC = (module.exports = function(pkgpath, manager, rc) {
    // TODO when run from package
    // Run from the package root (assumed) or exit
    var pkgdir = path.dirname(pkgpath);

    try {
        require(pkgpath);
    } catch (e) {
        console.error(
            'npx greenlock must be run from the package root (where package.json is)'
        );
        process.exit(1);
    }

    try {
        return module.exports._defaults(pkgdir, manager, rc);
    } catch (e) {
        if ('package.json' === e.context) {
            console.error(e.desc);
            process.exit(1);
        }
        console.error(e.message);
        process.exit(1);
    }
});

// Figure out what to do between what's hard-coded,
// what's in the config file, and what's left unset
module.exports.resolve = function(gconf) {
    var rc = GRC.read(gconf.packageRoot);
    if (gconf.configFile) {
        rc = { configFile: gconf.configFile };
    }

    var manager;
    var updates;

    if (rc.manager) {
        if (gconf.manager && rc.manager !== gconf.manager) {
            console.warn(
                'warn: ignoring hard-coded ' +
                    gconf.manager +
                    ' in favor of ' +
                    rc.manager
            );
        }
        gconf.manager = rc.manager;
    } else if (gconf.manager) {
        manager = gconf.manager;
    }

    if (rc.configFile) {
        if (gconf.configFile && rc.configFile !== gconf.configFile) {
            console.warn(
                'warn: ignoring hard-coded ' +
                    gconf.configFile +
                    ' in favor of ' +
                    rc.configFile
            );
        }
        gconf.configFile = rc.configFile;
    } else if (gconf.manager) {
        updates = { configFile: gconf.configFile };
    }

    return GRC._defaults(gconf.packageRoot, manager, rc);
};

module.exports._defaults = function(pkgdir, manager, rc) {
    var rcpath = path.join(pkgdir, '.greenlockrc');
    var _rc;
    var created = false;

    if (manager) {
        if ('.' === manager[0]) {
            manager = path.resolve(pkgdir, manager);
        }
        try {
            require(manager);
        } catch (e) {
            console.error('could not load ' + manager + ' from ' + pkgdir);
            throw e;
        }
    }

    var stuff = module.exports._read(pkgdir);
    _rc = stuff.rc;
    created = stuff.created;

    var changed;
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

    if (['@greenlock/manager', 'greenlock-manager-fs'].includes(_rc.manager)) {
        if (!_rc.configFile) {
            changed = true;
            _rc.configFile = path.join(pkgdir, 'greenlock.json');
        }
    }

    if (!changed) {
        return _rc;
    }

    var data = JSON.stringify(_rc, null, 2);
    if (created) {
        console.info('Wrote ' + rcpath);
    }
    saveFile(rcpath, data, 'utf8');
    return _rc;
};

module.exports.read = function(pkgdir) {
    return module.exports._read(pkgdir).rc;
};

module.exports._read = function(pkgdir) {
    var created;
    var rcpath = path.join(pkgdir, '.greenlockrc');
    var _data;
    try {
        _data = fs.readFileSync(rcpath, 'utf8');
    } catch (err) {
        if ('ENOENT' !== err.code) {
            throw err;
        }
        try {
            require(path.resolve(path.join(pkgdir, './package.json')));
        } catch (e) {
            e.context = 'package.json';
            e.desc =
                'run `greenlock` from the same directory as `package.json`, or specify `packageRoot` of `.greenlockrc`';
            throw e;
        }
        console.info('Creating ' + rcpath);
        created = true;
        _data = '{}';
        saveFile(rcpath, _data, 'utf8');
    }

    var rc;
    try {
        rc = JSON.parse(_data);
    } catch (e) {
        console.error("couldn't parse " + rcpath, _data);
        console.error('(perhaps you should just delete it and try again?)');
        process.exit(1);
    }

    return {
        created: created,
        rc: rc
    };
};
