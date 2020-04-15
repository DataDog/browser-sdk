#!/usr/bin/env bash

set -euo pipefail

export BS_USERNAME=$(aws ssm get-parameter --region us-east-1 --name ci.browser-sdk.bs_username --with-decryption --query "Parameter.Value" --out text)
export BS_ACCESS_KEY=$(aws ssm get-parameter --region us-east-1 --name ci.browser-sdk.bs_access_key --with-decryption --query "Parameter.Value" --out text)
export IP_ADDRESS=$(ifconfig | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | head -n 1)
yarn "$1":bs
