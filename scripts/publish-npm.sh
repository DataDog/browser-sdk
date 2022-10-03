#!/usr/bin/env bash

set -euo pipefail

echo '//registry.npmjs.org/:_authToken=${NPM_TOKEN}' > .npmrc
export NPM_TOKEN=$(aws ssm get-parameter --region us-east-1 --name ci.browser-sdk.npm_token --with-decryption --query "Parameter.Value" --out text)
BUILD_MODE=release yarn build
yarn lerna publish from-package
