const { printLog, printError, runMain } = require('../lib/executionUtils')
const { forEachFile } = require('../lib/filesUtils')
const OSS = require('ali-oss')
const dotenv = require('dotenv')
const CDN = require('@alicloud/cdn20180510')
const OpenApi = require('@alicloud/openapi-client')

dotenv.config()

const { buildBundleFolder, packages } = require('./lib/deploymentUtils')

const AWS_CONFIG = {
  prod: {
    dir: '/browser-sdk',
    endpoint: 'flashduty-public.oss-cn-beijing.aliyuncs.com',
    cdnURL: 'static.flashcat.cloud',
  },
  staging: {
    dir: '/browser-sdk-staging',
    endpoint: 'flashduty-public.oss-cn-beijing.aliyuncs.com',
    cdnURL: 'static.flashcat.cloud',
  },
}

const client = new OSS({
  region: process.env.OSS_REGION,
  accessKeyId: process.env.OSS_ACCESS_KEY,
  accessKeySecret: process.env.OSS_SECRET_KEY,
  bucket: process.env.OSS_BUCKET,
})

/**
 * Deploy SDK files to ali OSS
 * Usage:
 * node deploy-oss.js ${env} ${version}
 *      env = prod|staging
 *      version = vXXX
 */

if (require.main === module) {
  const env = process.argv[2]
  const version = process.argv[3]
  runMain(async () => {
    await main(env, version)
  })
}

async function main(env, version) {
  const awsConfig = AWS_CONFIG[env]

  let cloudfrontPathsToInvalidate = []
  for (const { packageName } of packages) {
    const pathsToInvalidate = await uploadPackage(awsConfig, packageName, version)
    cloudfrontPathsToInvalidate.push(...pathsToInvalidate)
  }
  refreshCdnCache(cloudfrontPathsToInvalidate)
}

// 读取bundle文件夹，上传到ali oss，并刷新cdn缓存
async function uploadPackage(awsConfig, packageName, version) {
  const cloudfrontPathsToInvalidate = []
  const bundleFolder = buildBundleFolder(packageName)

  await forEachFile(bundleFolder, async (bundlePath) => {
    if (!bundlePath.endsWith('.js')) {
      return
    }

    const relativeBundlePath = bundlePath.replace(`${bundleFolder}/`, '')
    const uploadPath = generateUploadPath(awsConfig, relativeBundlePath, version)
    // 上传到ali oss
    const uploadResult = await client.put(uploadPath, bundlePath)
    // 自有域名
    const ownDomainUrl = uploadResult.url.replace(awsConfig.endpoint, awsConfig.cdnURL)
    printLog(`成功将 ${bundlePath} 上传到 ${uploadPath}，开始刷新缓存`)
    cloudfrontPathsToInvalidate.push(ownDomainUrl)
  })

  return cloudfrontPathsToInvalidate
}
// ex: /browser-sdk/v4/datadog-rum.js
function generateUploadPath(awsConfig, relativeBundlePath, version) {
  return `${awsConfig.dir}/${version}/${relativeBundlePath}`
}

async function refreshCdnCache(ossFilePath) {
  if (ossFilePath.length >= 10) {
    printLog(`刷新cdn缓存失败：filePath.length不能大于10，当前fileLength=${ossFilePath.length}`)
    return
  }
  let config = new OpenApi.Config({
    accessKeyId: process.env.OSS_ACCESS_KEY,
    accessKeySecret: process.env.OSS_SECRET_KEY,
    endpoint: process.env.OSS_ENDPOINT,
    regionId: process.env.OSS_REGION,
  })
  let cacheClient = new CDN.default(config)
  try {
    // 创建一个新的请求实例
    const refreshRequest = new CDN.RefreshObjectCachesRequest({})
    refreshRequest.objectPath = ossFilePath.join('\n')
    refreshRequest.objectType = 'File'
    // 刷新cdn
    await cacheClient.refreshObjectCaches(refreshRequest)
    printLog(`刷新cdn缓存成功：${ossFilePath.join('\n')}`)
  } catch (error) {
    printError(`刷新cdn缓存失败：${error}`)
  }
}

module.exports = {
  main,
}
