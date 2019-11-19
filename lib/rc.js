'use strict';

var Rc = module.exports;
var fs = require('fs');
var path = require('path');

// This is only called if packageRoot is specified
// (which it should be most of the time)
Rc._initSync = function(dirname, manager, configDir) {
    if (!dirname) {
        return {};
    }

    // dirname / opts.packageRoot
    var rcpath = path.resolve(dirname, '.greenlockrc');
    var rc;

    try {
        rc = JSON.parse(fs.readFileSync(rcpath));
    } catch (e) {
        if ('ENOENT' !== e.code) {
            throw e;
        }
        rc = {};
    }

    var changed = true;

    // In the general case the manager should be specified in the
    // config file, which is in the config dir, but for the specific
    // case in which all custom plugins are being used and no config
    // dir is needed, we allow the manager to be read from the rc.
    // ex: manager: { module: 'name', xxxx: 'xxxx' }
    if (manager) {
        if (rc.manager) {
            if (
                ('string' === typeof rc.manager && rc.manager !== manager) ||
                ('string' !== typeof rc.manager &&
                    rc.manager.module !== manager.module)
            ) {
                changed = true;
                console.info(
                    "changing `manager` from '%s' to '%s'",
                    rc.manager.module || rc.manager,
                    manager.module || manager
                );
            }
        }
        rc.manager = manager;
    }

    if (!configDir) {
        configDir = rc.configDir;
    }

    if (configDir && configDir !== rc.configDir) {
        if (rc.configDir) {
            console.info(
                "changing `configDir` from '%s' to '%s'",
                rc.configDir,
                configDir
            );
        }
        changed = true;
        rc.configDir = configDir;
    } else if (!rc.configDir) {
        changed = true;
        configDir = './greenlock.d';
        rc.configDir = configDir;
    }

    if (changed) {
        fs.writeFileSync(rcpath, JSON.stringify(rc));
    }

    return rc;
};
