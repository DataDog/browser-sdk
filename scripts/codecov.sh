#!/usr/bin/env bash

export CODECOV_TOKEN=$(aws ssm get-parameter --region us-east-1 --name ci.browser-sdk.codecov_token --with-decryption --query "Parameter.Value" --out text)
yarn codecov -t "${CODECOV_TOKEN}" -f coverage/coverage-final.json
