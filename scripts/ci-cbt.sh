#!/usr/bin/env bash

set -euo pipefail

export CBT_USERNAME=$(aws ssm get-parameter --region us-east-1 --name ci.browser-sdk.cbt_username --with-decryption --query "Parameter.Value" --out text)
export CBT_AUTHKEY=$(aws ssm get-parameter --region us-east-1 --name ci.browser-sdk.cbt_authkey --with-decryption --query "Parameter.Value" --out text)
yarn "$1":cbt
