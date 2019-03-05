#!/usr/bin/env bash

set -ex

AWS_ACCOUNT_ID=727006795293
DISTRIBUTION_ID="E2FP11ZSCFD3EU"
BUCKET_NAME="browser-agent-artifacts-staging"
FILE_NAME="browser-agent.js"
BROWSER_CACHE=900

main() {
  in-isolation upload-to-s3
  in-isolation invalidate-cloudfront
}

upload-to-s3() {
    assume-role "build-stable-browser-agent-artifacts-s3-write"
    aws s3 cp --cache-control max-age=${BROWSER_CACHE} dist/${FILE_NAME} s3://${BUCKET_NAME}/${FILE_NAME}
}

invalidate-cloudfront() {
    assume-role "build-stable-cloudfront-invalidation"
    aws cloudfront create-invalidation --distribution-id ${DISTRIBUTION_ID} --paths /${FILE_NAME}
}

in-isolation() {
    function=$1
    # subshell to assume-role only for the function
    (
        ${function}
    )
}

assume-role() {
    set +x
    role_name=$1
    temp_credentials=$(aws sts assume-role --role-arn "arn:aws:iam::${AWS_ACCOUNT_ID}:role/${role_name}" --role-session-name AWSCLI-Session)
    export AWS_ACCESS_KEY_ID=$(echo "$temp_credentials" | jq -r .Credentials.AccessKeyId)
    export AWS_SECRET_ACCESS_KEY=$(echo "$temp_credentials" | jq -r .Credentials.SecretAccessKey)
    export AWS_SESSION_TOKEN=$(echo "$temp_credentials" | jq -r .Credentials.SessionToken)
    set -x
}

main
