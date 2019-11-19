'use strict';

var args = process.argv.slice(3);
var cli = require('./lib/cli.js');
//var path = require('path');
//var pkgpath = path.join(__dirname, '..', 'package.json');
//var pkgpath = path.join(process.cwd(), 'package.json');

var Flags = require('./lib/flags.js');

Flags.init().then(function({ flagOptions, greenlock, mconf }) {
    var myFlags = {};
    ['all', 'subject', 'servername' /*, 'servernames', 'altnames'*/].forEach(
        function(k) {
            myFlags[k] = flagOptions[k];
        }
    );

    cli.parse(myFlags);
    cli.main(function(argList, flags) {
        Flags.mangleFlags(flags, mconf);
        main(argList, flags, greenlock);
    }, args);
});

async function main(_, flags, greenlock) {
    var servernames = [flags.subject]
        .concat([flags.servername])
        //.concat(flags.servernames)
        //.concat(flags.altnames)
        .filter(Boolean);
    delete flags.subject;
    delete flags.altnames;
    flags.servernames = servernames;
    if (!flags.all && flags.servernames.length > 1) {
        console.error('Error: should specify either --subject OR --servername');
        process.exit(1);
        return;
    } else if (!flags.all && flags.servernames.length !== 1) {
        console.error('error: missing --servername <example.com>');
        process.exit(1);
        return;
    }
    if (!flags.all) {
        flags.servername = flags.servernames[0];
    } else if (flags.servername) {
        console.error(
            'error: missing cannot have --all and --servername / --subject'
        );
        process.exit(1);
    }
    delete flags.servernames;

    var getter = function() {
        return greenlock._config(flags);
    };
    if (flags.all) {
        getter = function() {
            return greenlock._configAll(flags);
        };
    }
    return getter()
        .catch(function(err) {
            console.error();
            console.error('error:', err.message);
            //console.log(err.stack);
            console.error();
            process.exit(1);
        })
        .then(function(sites) {
            if (!sites) {
                console.info();
                if (flags.all) {
                    console.info('No configs found');
                } else {
                    console.info('No config found for', flags.servername);
                }
                console.info();
                process.exit(1);
                return;
            }
            if (!Array.isArray(sites)) {
                sites = [sites];
            }

            sites.forEach(function(site) {
                console.info();
                console.info(
                    'Config for ' +
                        JSON.stringify(flags.servername || site.subject) +
                        ':'
                );
                console.info(JSON.stringify(site, null, 2));
            });
        });
}
