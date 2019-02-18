#!/usr/bin/env bash

export BS_USERNAME=$(aws ssm get-parameter --region us-east-1 --name ci.browser-agent.browserstack_username --with-decryption --query "Parameter.Value" --out text)
export BS_ACCESS_KEY=$(aws ssm get-parameter --region us-east-1 --name ci.browser-agent.browserstack_access_key --with-decryption --query "Parameter.Value" --out text)
yarn test:browserstack
