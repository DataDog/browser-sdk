#!/usr/bin/env bash

if ! grep -q '"s":{[^}]\+}' coverage/coverage-final.json; then
  echo "Error: empty code coverage"
  exit 1
fi

export CODECOV_TOKEN=$(aws ssm get-parameter --region us-east-1 --name ci.browser-sdk.codecov_token --with-decryption --query "Parameter.Value" --out text)
codecov -t "${CODECOV_TOKEN}" -f coverage/coverage-final.json
