#!/bin/bash

set -e

# TODO notify if wildcard is selected and no dns challenge is present
node bin/greenlock.js add --subject example.com --altnames 'example.com,*.example.com'
node bin/greenlock.js update --subject example.com
node bin/greenlock.js config --subject example.com
node bin/greenlock.js config --subject *.example.com
node bin/greenlock.js defaults
node bin/greenlock.js defaults --account-key-type
node bin/greenlock.js defaults
# using --challenge-xx-xx-xxx is additive
node bin/greenlock.js defaults --challenge-dns-01 foo-http-01-bar --challenge-dns-01-token BIG_TOKEN
# using --challenge is exclusive (will delete things not mentioned)
node bin/greenlock.js defaults --challenge acme-http-01-standalone
# should delete all and add just this one anew
node bin/greenlock.js update --subject example.com --challenge bar-http-01-baz
# should add, leaving the existing
node bin/greenlock.js update --subject example.com --challenge-dns-01 baz-dns-01-qux --challenge-dns-01-token BIG_TOKEN
# should delete all and add just this one anew
node bin/greenlock.js update --subject example.com --challenge bar-http-01-baz
node bin/greenlock.js remove --subject example.com

# TODO test for failure
# node bin/greenlock.js add --subject example.com
# node bin/greenlock.js add --subject example --altnames example
# node bin/greenlock.js add --subject example.com --altnames '*.example.com'
# node bin/greenlock.js add --subject example.com --altnames '*.example.com,example.com'
# node bin/greenlock.js update --altnames example.com
# node bin/greenlock.js config foo.example.com
