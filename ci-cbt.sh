#!/usr/bin/env bash

export CBT_USERNAME=$(aws ssm get-parameter --region us-east-1 --name ci.browser-agent.cbt_username --with-decryption --query "Parameter.Value" --out text)
export CBT_AUTHKEY=$(aws ssm get-parameter --region us-east-1 --name ci.browser-agent.cbt_authkey --with-decryption --query "Parameter.Value" --out text)
yarn test:unit:cbt
yarn test:e2e:cbt
