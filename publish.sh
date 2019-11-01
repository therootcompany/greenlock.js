#!/bin/bash

set -e
set -u

git fetch --all
git checkout master
git pull origin master

git checkout npm
git checkout master -- package.json
git checkout master -- README.md
git add package* README.md || true
git commit -m "bump" || true
sed -i '' -e 's|"name": ".root.greenlock"|"name": "greenlock"|' package.json
npm install --save @root/greenlock@latest
npm publish ./
git reset --hard
