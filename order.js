var accountKeypair = await Keypairs.generate({ kty: accKty });
if (config.debug) {
    console.info('Account Key Created');
    console.info(JSON.stringify(accountKeypair, null, 2));
    console.info();
    console.info();
}

var account = await acme.accounts.create({
    agreeToTerms: agree,
    // TODO detect jwk/pem/der?
    accountKeypair: { privateKeyJwk: accountKeypair.private },
    subscriberEmail: config.email
});

// TODO top-level agree
function agree(tos) {
    if (config.debug) {
        console.info('Agreeing to Terms of Service:');
        console.info(tos);
        console.info();
        console.info();
    }
    agreed = true;
    return Promise.resolve(tos);
}
if (config.debug) {
    console.info('New Subscriber Account');
    console.info(JSON.stringify(account, null, 2));
    console.info();
    console.info();
}
if (!agreed) {
    throw new Error('Failed to ask the user to agree to terms');
}

var certKeypair = await Keypairs.generate({ kty: srvKty });
var pem = await Keypairs.export({
    jwk: certKeypair.private,
    encoding: 'pem'
});
if (config.debug) {
    console.info('Server Key Created');
    console.info('privkey.jwk.json');
    console.info(JSON.stringify(certKeypair, null, 2));
    // This should be saved as `privkey.pem`
    console.info();
    console.info('privkey.' + srvKty.toLowerCase() + '.pem:');
    console.info(pem);
    console.info();
}

// 'subject' should be first in list
var domains = randomDomains(rnd);
if (config.debug) {
    console.info('Get certificates for random domains:');
    console.info(
        domains
            .map(function(puny) {
                var uni = punycode.toUnicode(puny);
                if (puny !== uni) {
                    return puny + ' (' + uni + ')';
                }
                return puny;
            })
            .join('\n')
    );
    console.info();
}

// Create CSR
var csrDer = await CSR.csr({
    jwk: certKeypair.private,
    domains: domains,
    encoding: 'der'
});
var csr = Enc.bufToUrlBase64(csrDer);
var csrPem = PEM.packBlock({
    type: 'CERTIFICATE REQUEST',
    bytes: csrDer /* { jwk: jwk, domains: opts.domains } */
});
if (config.debug) {
    console.info('Certificate Signing Request');
    console.info(csrPem);
    console.info();
}

var results = await acme.certificates.create({
    account: account,
    accountKeypair: { privateKeyJwk: accountKeypair.private },
    csr: csr,
    domains: domains,
    challenges: challenges, // must be implemented
    customerEmail: null
});
