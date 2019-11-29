var DIR = module.exports;

// This will ALWAYS print out a notice if the URL is clearly a staging URL
DIR._getDirectoryUrl = function(dirUrl, domain) {
    var liveUrl = 'https://acme-v02.api.letsencrypt.org/directory';
    dirUrl = DIR._getDefaultDirectoryUrl(dirUrl, '', domain);
    if (!dirUrl) {
        dirUrl = liveUrl;
        // This will print out a notice (just once) if no directoryUrl has been supplied
        if (!DIR._shownDirectoryUrl) {
            DIR._shownDirectoryUrl = true;
            console.info('ACME Directory URL:', dirUrl);
        }
    }
    return dirUrl;
};

// Handle staging URLs, pebble test server, etc
DIR._getDefaultDirectoryUrl = function(dirUrl, staging, domain) {
    var stagingUrl = 'https://acme-staging-v02.api.letsencrypt.org/directory';
    var stagingRe = /(^http:|staging|^127\.0\.|^::|localhost)/;
    var env = '';
    var args = [];
    if ('undefined' !== typeof process) {
        env = (process.env && process.env.ENV) || '';
        args = (process.argv && process.argv.slice(1)) || [];
    }

    if (
        staging ||
        stagingRe.test(dirUrl) ||
        args.includes('--staging') ||
        /DEV|STAG/i.test(env)
    ) {
        if (!stagingRe.test(dirUrl)) {
            dirUrl = stagingUrl;
        }
        console.info('[staging] ACME Staging Directory URL:', dirUrl, env);
        console.warn('FAKE CERTIFICATES (for testing) only', env, domain);
        console.warn('');
    }

    return dirUrl;
};

DIR._shownDirectoryUrl = false;
