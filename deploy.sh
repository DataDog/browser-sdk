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
EU_LOGS_FILE_NAME="datadog-logs-eu.js"
US_LOGS_FILE_NAME="datadog-logs-us.js"
EU_RUM_FILE_NAME="datadog-rum-eu.js"
US_RUM_FILE_NAME="datadog-rum-us.js"

main() {
  in-isolation upload-to-s3
  in-isolation invalidate-cloudfront
}

upload-to-s3() {
    assume-role "build-stable-browser-agent-artifacts-s3-write"
    for file_name in ${EU_LOGS_FILE_NAME} ${US_LOGS_FILE_NAME} ${EU_RUM_FILE_NAME} ${US_RUM_FILE_NAME}; do
      echo "Upload ${file_name}"
      aws s3 cp --cache-control max-age=${BROWSER_CACHE} dist/${file_name} s3://${BUCKET_NAME}/${file_name};
    done
}

invalidate-cloudfront() {
    assume-role "build-stable-cloudfront-invalidation"
    echo "Creating invalidation"
    aws cloudfront create-invalidation --distribution-id ${DISTRIBUTION_ID} --paths /${EU_LOGS_FILE_NAME} /${US_LOGS_FILE_NAME} /${EU_RUM_FILE_NAME} /${US_RUM_FILE_NAME}
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
