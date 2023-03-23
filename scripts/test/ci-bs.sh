#!/usr/bin/env bash

set -euo pipefail

export BS_USERNAME=$(aws ssm get-parameter --region us-east-1 --name ci.browser-sdk.bs_username --with-decryption --query "Parameter.Value" --out text)
export BS_ACCESS_KEY=$(aws ssm get-parameter --region us-east-1 --name ci.browser-sdk.bs_access_key --with-decryption --query "Parameter.Value" --out text)
yarn "$1":bs
