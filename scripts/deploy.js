'use strict'

const { printLog, command, runMain } = require('./utils')

const ONE_MINUTE_IN_SECOND = 60
const ONE_HOUR_IN_SECOND = 60 * ONE_MINUTE_IN_SECOND
const AWS_CONFIG = {
  prod: {
    accountId: 464622532012,
    bucketName: 'browser-agent-artifacts-prod',
    distributionId: 'EGB08BYCT1DD9',
  },
  staging: {
    accountId: 727006795293,
    bucketName: 'browser-agent-artifacts-staging',
    distributionId: 'E2FP11ZSCFD3EU',
  },
}
/**
 * Deploy SDK files to CDN
 * Usage:
 * node deploy.js staging|prod staging|canary|vXXX
 */
const env = process.argv[2]
const version = process.argv[3]

const browserCache = version === 'staging' || version === 'canary' ? 15 * ONE_MINUTE_IN_SECOND : 4 * ONE_HOUR_IN_SECOND
const cacheControl = `max-age=${browserCache}, s-maxage=60`

const bundles = {
  'packages/rum/bundle/datadog-rum.js': `datadog-rum-${version}.js`,
  'packages/rum-slim/bundle/datadog-rum-slim.js': `datadog-rum-slim-${version}.js`,
  'packages/logs/bundle/datadog-logs.js': `datadog-logs-${version}.js`,
}

function generateEnvironmentForRole(awsAccountId, roleName) {
  const rawCredentials = command`
  aws sts assume-role 
    --role-arn arn:aws:iam::${awsAccountId}:role/${roleName} 
    --role-session-name AWSCLI-Session`.run()
  const credentials = JSON.parse(rawCredentials)['Credentials']
  return {
    AWS_ACCESS_KEY_ID: credentials['AccessKeyId'],
    AWS_SECRET_ACCESS_KEY: credentials['SecretAccessKey'],
    AWS_SESSION_TOKEN: credentials['SessionToken'],
  }
}

function uploadToS3(awsConfig) {
  const accessToS3 = generateEnvironmentForRole(awsConfig.accountId, 'build-stable-browser-agent-artifacts-s3-write')
  for (const [filePath, bundleName] of Object.entries(bundles)) {
    printLog(`Upload ${filePath} to s3://${awsConfig.bucketName}/${bundleName}`)
    command`
    aws s3 cp --cache-control ${cacheControl} ${filePath} s3://${awsConfig.bucketName}/${bundleName}`
      .withEnvironment(accessToS3)
      .run()
  }
}

function invalidateCloudfront(awsConfig) {
  const accessToCloudfront = generateEnvironmentForRole(awsConfig.accountId, 'build-stable-cloudfront-invalidation')
  const pathsToInvalidate = Object.values(bundles).map((path) => `/${path}`)

  printLog(`Trigger invalidation on ${awsConfig.distributionId} for: ${pathsToInvalidate.join(', ')}`)
  command`
    aws cloudfront create-invalidation --distribution-id ${awsConfig.distributionId} --paths ${pathsToInvalidate}`
    .withEnvironment(accessToCloudfront)
    .run()
}

runMain(() => {
  uploadToS3(AWS_CONFIG[env])
  invalidateCloudfront(AWS_CONFIG[env])
})
