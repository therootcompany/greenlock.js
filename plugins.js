'use strict';

var P = module.exports;

var spawn = require('child_process').spawn;
var spawnSync = require('child_process').spawnSync;
var promisify = require('util').promisify;

// Exported for CLIs and such to override
P.PKG_DIR = __dirname;

P._loadStore = function(storeConf) {
    return P._loadHelper(storeConf.module).then(function(plugin) {
        return P._normalizeStore(storeConf.module, plugin.create(storeConf));
    });
};
P._loadChallenge = function(chConfs, typ01) {
    return P._loadHelper(chConfs[typ01].module).then(function(plugin) {
        var ch = P._normalizeChallenge(
            chConfs[typ01].module,
            plugin.create(chConfs[typ01])
        );
        ch._type = typ01;
        return ch;
    });
};
P._loadHelper = function(modname) {
    try {
        return Promise.resolve(require(modname));
    } catch (e) {
        console.error("Could not load '%s'", modname);
        console.error('Did you install it?');
        console.error('\tnpm install --save %s', modname);
        e.context = 'load_plugin';
        throw e;

        // Fun experiment, bad idea
        /*
		return P._install(modname).then(function() {
			return require(modname);
		});
    */
    }
};

P._normalizeStore = function(name, store) {
    var acc = store.accounts;
    var crt = store.certificates;

    var warned = false;
    function warn() {
        if (warned) {
            return;
        }
        warned = true;
        console.warn(
            "'" +
                name +
                "' may have incorrect function signatures, or contains deprecated use of callbacks"
        );
    }

    // accs
    if (acc.check && 2 === acc.check.length) {
        warn();
        acc._thunk_check = acc.check;
        acc.check = promisify(acc._thunk_check);
    }
    if (acc.set && 3 === acc.set.length) {
        warn();
        acc._thunk_set = acc.set;
        acc.set = promisify(acc._thunk_set);
    }
    if (2 === acc.checkKeypair.length) {
        warn();
        acc._thunk_checkKeypair = acc.checkKeypair;
        acc.checkKeypair = promisify(acc._thunk_checkKeypair);
    }
    if (3 === acc.setKeypair.length) {
        warn();
        acc._thunk_setKeypair = acc.setKeypair;
        acc.setKeypair = promisify(acc._thunk_setKeypair);
    }

    // certs
    if (2 === crt.check.length) {
        warn();
        crt._thunk_check = crt.check;
        crt.check = promisify(crt._thunk_check);
    }
    if (3 === crt.set.length) {
        warn();
        crt._thunk_set = crt.set;
        crt.set = promisify(crt._thunk_set);
    }
    if (2 === crt.checkKeypair.length) {
        warn();
        crt._thunk_checkKeypair = crt.checkKeypair;
        crt.checkKeypair = promisify(crt._thunk_checkKeypair);
    }
    if (2 === crt.setKeypair.length) {
        warn();
        crt._thunk_setKeypair = crt.setKeypair;
        crt.setKeypair = promisify(crt._thunk_setKeypair);
    }

    return store;
};
P._normalizeChallenge = function(name, ch) {
    var gch = {};
    var warned = false;
    function warn() {
        if (warned) {
            return;
        }
        warned = true;
        console.warn(
            "'" +
                name +
                "' may have incorrect function signatures, or contains deprecated use of callbacks"
        );
    }

    var warned2 = false;
    function warn2() {
        if (warned2) {
            return;
        }
        warned2 = true;
        console.warn(
            "'" +
                name +
                "' did not return a Promise when called. This should be fixed by the maintainer."
        );
    }

    function wrappy(fn) {
        return function(_params) {
            return Promise.resolve().then(function() {
                var result = fn.call(ch, _params);
                if (!result || !result.then) {
                    warn2();
                }
                return result;
            });
        };
    }

    // init, zones, set, get, remove, propagationDelay
    if (ch.init) {
        if (2 === ch.init.length) {
            warn();
            ch._thunk_init = ch.init;
            ch.init = promisify(ch._thunk_init);
        }
        gch.init = wrappy(ch.init);
    }
    if (ch.zones) {
        if (2 === ch.zones.length) {
            warn();
            ch._thunk_zones = ch.zones;
            ch.zones = promisify(ch._thunk_zones);
        }
        gch.zones = wrappy(ch.zones);
    }
    if (2 === ch.set.length) {
        warn();
        ch._thunk_set = ch.set;
        ch.set = promisify(ch._thunk_set);
    }
    gch.set = wrappy(ch.set);
    if (2 === ch.remove.length) {
        warn();
        ch._thunk_remove = ch.remove;
        ch.remove = promisify(ch._thunk_remove);
    }
    gch.remove = wrappy(ch.remove);
    if (ch.get) {
        if (2 === ch.get.length) {
            warn();
            ch._thunk_get = ch.get;
            ch.get = promisify(ch._thunk_get);
        }
        gch.get = wrappy(ch.get);
    }
    if("number" === typeof ch.propagationDelay) {
        gch.propagationDelay = ch.propagationDelay;
    }

    return gch;
};

P._loadSync = function(modname) {
    try {
        return require(modname);
    } catch (e) {
        console.error("Could not load '%s'", modname);
        console.error('Did you install it?');
        console.error('\tnpm install --save %s', modname);
        e.context = 'load_plugin';
        throw e;
    }
    /*
	try {
		mod = require(modname);
	} catch (e) {
		P._installSync(modname);
		mod = require(modname);
	}
  */
};

P._installSync = function(moduleName) {
    try {
        return require(moduleName);
    } catch (e) {
        // continue
    }
    var npm = 'npm';
    var args = ['install', '--save', moduleName];
    var out = '';
    var cmd;

    try {
        cmd = spawnSync(npm, args, {
            cwd: P.PKG_DIR,
            windowsHide: true
        });
    } catch (e) {
        console.error(
            "Failed to start: '" +
                npm +
                ' ' +
                args.join(' ') +
                "' in '" +
                P.PKG_DIR +
                "'"
        );
        console.error(e.message);
        process.exit(1);
    }

    if (!cmd.status) {
        return;
    }

    out += cmd.stdout.toString('utf8');
    out += cmd.stderr.toString('utf8');

    if (out) {
        console.error(out);
        console.error();
        console.error();
    }

    console.error(
        "Failed to run: '" +
            npm +
            ' ' +
            args.join(' ') +
            "' in '" +
            P.PKG_DIR +
            "'"
    );

    console.error(
        'Try for yourself:\n\tcd ' + P.PKG_DIR + '\n\tnpm ' + args.join(' ')
    );

    process.exit(1);
};

P._install = function(moduleName) {
    return new Promise(function(resolve) {
        if (!moduleName) {
            throw new Error('no module name given');
        }

        var npm = 'npm';
        var args = ['install', '--save', moduleName];
        var out = '';
        var cmd = spawn(npm, args, {
            cwd: P.PKG_DIR,
            windowsHide: true
        });

        cmd.stdout.on('data', function(chunk) {
            out += chunk.toString('utf8');
        });
        cmd.stdout.on('data', function(chunk) {
            out += chunk.toString('utf8');
        });

        cmd.on('error', function(e) {
            console.error(
                "Failed to start: '" +
                    npm +
                    ' ' +
                    args.join(' ') +
                    "' in '" +
                    P.PKG_DIR +
                    "'"
            );
            console.error(e.message);
            process.exit(1);
        });

        cmd.on('exit', function(code) {
            if (!code) {
                resolve();
                return;
            }

            if (out) {
                console.error(out);
                console.error();
                console.error();
            }
            console.error(
                "Failed to run: '" +
                    npm +
                    ' ' +
                    args.join(' ') +
                    "' in '" +
                    P.PKG_DIR +
                    "'"
            );
            console.error(
                'Try for yourself:\n\tcd ' +
                    P.PKG_DIR +
                    '\n\tnpm ' +
                    args.join(' ')
            );
            process.exit(1);
        });
    });
};

if (require.main === module) {
    P._installSync(process.argv[2]);
}
