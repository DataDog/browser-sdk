'use strict'

const { printLog, command, runMain } = require('./utils')
const { buildRootUploadPath, buildDatacenterUploadPath, buildSourcePath, packages } = require('./deployment-utils')

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
 * node deploy.js staging|prod staging|canary|vXXX root,us1,eu1,...
 */
const env = process.argv[2]
const version = process.argv[3]
const uploadPathTypes = process.argv[4].split(',')

runMain(() => {
  const awsConfig = AWS_CONFIG[env]
  let cloudfrontPathsToInvalidate = []
  for (const { packageName } of packages) {
    for (const uploadPathType of uploadPathTypes) {
      const buildUploadPath =
        uploadPathType === 'root' ? buildRootUploadPath : buildDatacenterUploadPath(uploadPathType)
      const sourcePath = buildSourcePath(packageName)
      const uploadPath = buildUploadPath(packageName, version)

      uploadToS3(awsConfig, sourcePath, uploadPath)
      cloudfrontPathsToInvalidate.push(`/${uploadPath}`)
    }
  }
  invalidateCloudfront(awsConfig, cloudfrontPathsToInvalidate)
})

function uploadToS3(awsConfig, sourcePath, uploadPath) {
  const accessToS3 = generateEnvironmentForRole(awsConfig.accountId, 'build-stable-browser-agent-artifacts-s3-write')

  const browserCache =
    version === 'staging' || version === 'canary' ? 15 * ONE_MINUTE_IN_SECOND : 4 * ONE_HOUR_IN_SECOND
  const cacheControl = `max-age=${browserCache}, s-maxage=60`

  printLog(`Upload ${sourcePath} to s3://${awsConfig.bucketName}/${uploadPath}`)
  command`
  aws s3 cp --cache-control ${cacheControl} ${sourcePath} s3://${awsConfig.bucketName}/${uploadPath}`
    .withEnvironment(accessToS3)
    .run()
}

function invalidateCloudfront(awsConfig, pathsToInvalidate) {
  const accessToCloudfront = generateEnvironmentForRole(awsConfig.accountId, 'build-stable-cloudfront-invalidation')

  printLog(`Trigger invalidation on ${awsConfig.distributionId} for: ${pathsToInvalidate.join(', ')}`)
  command`
    aws cloudfront create-invalidation --distribution-id ${awsConfig.distributionId} --paths ${pathsToInvalidate}`
    .withEnvironment(accessToCloudfront)
    .run()
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
