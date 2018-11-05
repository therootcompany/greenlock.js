#!/bin/bash
set -e

# This test is intended to run on a digital ocean instance on which all of the
# following domains are listed on the same certificate as either subject or altnames:
# test.ppl.family, www.test.ppl.family, test.greenlock.domains, www.test.greenlock.domains

curl -sf https://test.ppl.family | grep -i Hello >/dev/null && echo "PASS no servername" || echo "FAIL no servername"
curl -sf https://test.ppl.family -H "Host: test.ppl.family" | grep -i Hello >/dev/null && echo "PASS same servername" || echo "FAIL same servername"
curl -sf https://test.ppl.family -H "Host: www.test.ppl.family" | grep -i Hello >/dev/null && echo "PASS similar altnames" || echo "FAIL similar altnames"
curl -sf https://test.ppl.family -H "Host: www.test.greenlock.domains" | grep -i Hello >/dev/null && echo "PASS full altnames" || echo "FAIL full altnames"
curl -s https://test.ppl.family -H "Host: example.com" | grep -i 'Domain Fronting' >/dev/null && echo "PASS detect fronting" || echo "FAIL detect fronting"
echo "PASS ALL"
