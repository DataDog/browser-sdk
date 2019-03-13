#!/usr/bin/env bash

set -ex

env=$1

case "${env}" in
"prod")
    AWS_ACCOUNT_ID=464622532012
    BUCKET_NAME="browser-agent-artifacts"
    DISTRIBUTION_ID="TBD"
    ;;
"staging")
    AWS_ACCOUNT_ID=727006795293
    BUCKET_NAME="browser-agent-artifacts-staging"
    DISTRIBUTION_ID="E2FP11ZSCFD3EU"
    ;;
* )
    echo "Usage: ./deploy.sh staging|prod"
    exit 1
    ;;
esac

BROWSER_CACHE=900
CORE_FILE_NAME="browser-agent-core.js"
RUM_FILE_NAME="browser-agent.js"

main() {
  in-isolation upload-to-s3
  in-isolation invalidate-cloudfront
}

upload-to-s3() {
    assume-role "build-stable-browser-agent-artifacts-s3-write"
    aws s3 cp --cache-control max-age=${BROWSER_CACHE} dist/${CORE_FILE_NAME} s3://${BUCKET_NAME}/${CORE_FILE_NAME}
    aws s3 cp --cache-control max-age=${BROWSER_CACHE} dist/${RUM_FILE_NAME} s3://${BUCKET_NAME}/${RUM_FILE_NAME}
}

invalidate-cloudfront() {
    assume-role "build-stable-cloudfront-invalidation"
    # TODO do not invalidate CORE_FILE_NAME if only RUM_FILE_NAME changed.
    aws cloudfront create-invalidation --distribution-id ${DISTRIBUTION_ID} --paths /${CORE_FILE_NAME} /${RUM_FILE_NAME}
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
