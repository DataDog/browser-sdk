#!/usr/bin/env bash

set -ex

env=$1
datacenter=$2

case "${env}" in
"prod")
    AWS_ACCOUNT_ID=464622532012
    BUCKET_NAME="browser-agent-artifacts-prod"
    DISTRIBUTION_ID="EGB08BYCT1DD9"
    ;;
"staging")
    AWS_ACCOUNT_ID=727006795293
    BUCKET_NAME="browser-agent-artifacts-staging"
    DISTRIBUTION_ID="E2FP11ZSCFD3EU"
    ;;
* )
    echo "Usage: ./deploy.sh staging|prod [eu|us]"
    exit 1
    ;;
esac

case "${datacenter}" in
"eu")
    LOGS_FILE_NAME="datadog-logs-eu.js"
    RUM_FILE_NAME="datadog-rum-eu.js"
    ;;
"us")
    LOGS_FILE_NAME="datadog-logs-us.js"
    RUM_FILE_NAME="datadog-rum-us.js"
    ;;
"")
    LOGS_FILE_NAME="datadog-logs.js"
    RUM_FILE_NAME="datadog-rum.js"
    ;;
* )
    echo "Usage: ./deploy.sh staging|prod [eu|us]"
    exit 1
    ;;
esac

CACHE_CONTROL='max-age=900, s-maxage=60'
LOGS_BUNDLE_PATH="packages/logs/bundle"
RUM_BUNDLE_PATH="packages/rum/bundle"
declare -A paths
paths[${LOGS_FILE_NAME}]="${LOGS_BUNDLE_PATH}/${LOGS_FILE_NAME}"
paths[${RUM_FILE_NAME}]="${RUM_BUNDLE_PATH}/${RUM_FILE_NAME}"

main() {
  in-isolation upload-to-s3
  in-isolation invalidate-cloudfront
}

upload-to-s3() {
    assume-role "build-stable-browser-agent-artifacts-s3-write"
    for file_name in ${LOGS_FILE_NAME} ${RUM_FILE_NAME}; do
      echo "Upload ${file_name}"
      aws s3 cp --cache-control "$CACHE_CONTROL" ${paths[${file_name}]} s3://${BUCKET_NAME}/${file_name};
    done
}

invalidate-cloudfront() {
    assume-role "build-stable-cloudfront-invalidation"
    echo "Creating invalidation"
    aws cloudfront create-invalidation --distribution-id ${DISTRIBUTION_ID} --paths /${LOGS_FILE_NAME} /${RUM_FILE_NAME}
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
