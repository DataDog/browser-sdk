import { printLog, runMain } from '../lib/executionUtils.ts'
import { fetchPR, LOCAL_BRANCH } from '../lib/gitUtils.ts'
import { command } from '../lib/command.ts'
import { forEachFile } from '../lib/filesUtils.ts'

import {
  buildRootUploadPath,
  buildDatacenterUploadPath,
  buildBundleFolder,
  buildPullRequestUploadPath,
  packages,
} from './lib/deploymentUtils.ts'

interface AwsConfig {
  accountId: number
  bucketName: string
  distributionId: string
}

interface AwsCredentials {
  AccessKeyId: string
  SecretAccessKey: string
  SessionToken: string
}

interface EnvironmentVars extends Record<string, string> {
  AWS_ACCESS_KEY_ID: string
  AWS_SECRET_ACCESS_KEY: string
  AWS_SESSION_TOKEN: string
}

const ONE_MINUTE_IN_SECOND = 60
const ONE_HOUR_IN_SECOND = 60 * ONE_MINUTE_IN_SECOND
const AWS_CONFIG: Record<string, AwsConfig> = {
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
 * node deploy.ts staging|prod staging|canary|pull-request|vXXX root,pull-request,us1,eu1,...
 */
if (!process.env.NODE_TEST_CONTEXT) {
  const env: string = process.argv[2]
  const version: string = process.argv[3]
  const uploadPathTypes: string[] = process.argv[4].split(',')
  runMain(async () => {
    await main(env, version, uploadPathTypes)
  })
}

export async function main(env: string, version: string, uploadPathTypes: string[]): Promise<void> {
  const awsConfig = AWS_CONFIG[env]
  const cloudfrontPathsToInvalidate: string[] = []
  for (const { packageName } of packages) {
    const pathsToInvalidate = await uploadPackage(awsConfig, packageName, version, uploadPathTypes)
    cloudfrontPathsToInvalidate.push(...pathsToInvalidate)
  }
  invalidateCloudfront(awsConfig, cloudfrontPathsToInvalidate)
}

async function uploadPackage(
  awsConfig: AwsConfig,
  packageName: string,
  version: string,
  uploadPathTypes: string[]
): Promise<string[]> {
  const cloudfrontPathsToInvalidate: string[] = []
  const bundleFolder = buildBundleFolder(packageName)

  for (const uploadPathType of uploadPathTypes) {
    await forEachFile(bundleFolder, async (bundlePath: string) => {
      if (!bundlePath.endsWith('.js')) {
        return
      }

      const relativeBundlePath = bundlePath.replace(`${bundleFolder}/`, '')
      const uploadPath = await generateUploadPath(uploadPathType, relativeBundlePath, version)

      uploadToS3(awsConfig, bundlePath, uploadPath, version)
      cloudfrontPathsToInvalidate.push(`/${uploadPath}`)
    })
  }

  return cloudfrontPathsToInvalidate
}

async function generateUploadPath(uploadPathType: string, filePath: string, version: string): Promise<string> {
  let uploadPath: string

  if (uploadPathType === 'pull-request') {
    const pr = await fetchPR(LOCAL_BRANCH as string)
    if (!pr) {
      console.log('No pull requests found for the branch')
      process.exit(0)
    }
    uploadPath = buildPullRequestUploadPath(filePath, pr.number.toString())
  } else if (uploadPathType === 'root') {
    uploadPath = buildRootUploadPath(filePath, version)
  } else {
    uploadPath = buildDatacenterUploadPath(uploadPathType, filePath, version)
  }

  return uploadPath
}

function uploadToS3(awsConfig: AwsConfig, bundlePath: string, uploadPath: string, version: string): void {
  const accessToS3 = generateEnvironmentForRole(awsConfig.accountId, 'build-stable-browser-agent-artifacts-s3-write')

  const browserCache =
    version === 'staging' || version === 'canary' || version === 'pull-request'
      ? 15 * ONE_MINUTE_IN_SECOND
      : 4 * ONE_HOUR_IN_SECOND
  const cacheControl = `max-age=${browserCache}, s-maxage=60`

  printLog(`Upload ${bundlePath} to s3://${awsConfig.bucketName}/${uploadPath}`)
  command`
  aws s3 cp --cache-control ${cacheControl} ${bundlePath} s3://${awsConfig.bucketName}/${uploadPath}`
    .withEnvironment(accessToS3)
    .run()
}

function invalidateCloudfront(awsConfig: AwsConfig, pathsToInvalidate: string[]): void {
  const accessToCloudfront = generateEnvironmentForRole(awsConfig.accountId, 'build-stable-cloudfront-invalidation')

  printLog(`Trigger invalidation on ${awsConfig.distributionId} for: ${pathsToInvalidate.join(', ')}`)
  command`
    aws cloudfront create-invalidation --distribution-id ${awsConfig.distributionId} --paths ${pathsToInvalidate}`
    .withEnvironment(accessToCloudfront)
    .run()
}

function generateEnvironmentForRole(awsAccountId: number, roleName: string): EnvironmentVars {
  const rawCredentials = command`
  aws sts assume-role
    --role-arn arn:aws:iam::${awsAccountId}:role/${roleName}
    --role-session-name AWSCLI-Session`.run()
  const credentials: AwsCredentials = JSON.parse(rawCredentials)['Credentials']
  return {
    AWS_ACCESS_KEY_ID: credentials.AccessKeyId,
    AWS_SECRET_ACCESS_KEY: credentials.SecretAccessKey,
    AWS_SESSION_TOKEN: credentials.SessionToken,
  }
}
