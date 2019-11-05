'use strict';

require('greenlock-express')
    .init(function() {
        return {
            greenlock: require('./greenlock.js'),

            // whether or not to run at cloudscale
            cluster: false
        };
    })
    .ready(function(glx) {
        var app = require('./app.js');

        // Serves on 80 and 443
        // Get's SSL certificates magically!
        glx.serveApp(app);
    });
