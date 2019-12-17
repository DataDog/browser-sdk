#!/usr/bin/env bash

set -euo pipefail

export NPM_TOKEN=$(aws ssm get-parameter --region us-east-1 --name ci.browser-sdk.npm_token --with-decryption --query "Parameter.Value" --out text)
yarn lerna publish from-git --yes
