'use strict'

const path = require('path')
const { printLog, runMain } = require('../lib/executionUtils')
const { command } = require('../lib/command')
const { getBuildEnvValue } = require('../lib/buildEnv')
const { getTelemetryOrgApiKey } = require('../lib/secrets')
const { siteByDatacenter } = require('../lib/datadogSites')
const { forEachFile } = require('../lib/filesUtils')
const {
  buildRootUploadPath,
  buildDatacenterUploadPath,
  buildBundleFolder,
  buildBundleFileName,
  packages,
} = require('./lib/deploymentUtils')

/**
 * Upload source maps to datadog
 * Usage:
 * BUILD_MODE=canary|release node upload-source-maps.js staging|canary|vXXX root,us1,eu1,...
 */
const version = process.argv[2]
let uploadPathTypes = process.argv[3].split(',')

function getSitesByVersion(version) {
  switch (version) {
    case 'staging':
      return ['datad0g.com', 'datadoghq.com']
    case 'canary':
      return ['datadoghq.com']
    default:
      return Object.values(siteByDatacenter)
  }
}

runMain(async () => {
  for (const { packageName, service } of packages) {
    await uploadSourceMaps(packageName, service)
  }
  printLog('Source maps upload done.')
})

async function uploadSourceMaps(packageName, service) {
  const bundleFolder = buildBundleFolder(packageName)

  for (const uploadPathType of uploadPathTypes) {
    await forEachFile(bundleFolder, (bundlePath) => {
      if (!bundlePath.endsWith('.js.map')) {
        return
      }
      const relativeBundlePath = bundlePath.replace(`${bundleFolder}/`, '')

      let sites
      let uploadPath
      if (uploadPathType === 'root') {
        sites = getSitesByVersion(version)
        uploadPath = buildRootUploadPath(relativeBundlePath, version)
        renameFilesWithVersionSuffix(relativeBundlePath, bundleFolder)
      } else {
        sites = [siteByDatacenter[uploadPathType]]
        uploadPath = buildDatacenterUploadPath(uploadPathType, packageName, version)
      }
      const prefix = path.dirname(`/${uploadPath}`)
      uploadToDatadog(packageName, service, prefix, bundleFolder, sites)
    })
  }
}

function renameFilesWithVersionSuffix(filePath, bundleFolder) {
  // The datadog-ci CLI is taking a directory as an argument. It will scan every source map files in
  // it and upload those along with the minified bundle. The file names must match the one from the
  // CDN, thus we need to rename the bundles with the right suffix.
  for (const extension of ['.js', '.js.map']) {
    const temp = filePath.replace('.js.map', extension)
    const bundlePath = `${bundleFolder}/${buildBundleFileName(temp)}`
    const uploadPath = `${bundleFolder}/${buildRootUploadPath(temp, version)}`

    command`mv ${bundlePath} ${uploadPath}`.run()
  }
}

function uploadToDatadog(packageName, service, prefix, bundleFolder, sites) {
  for (const site of sites) {
    printLog(`Uploading ${packageName} source maps with prefix ${prefix} for ${site}...`)

    command`
    datadog-ci sourcemaps upload ${bundleFolder}
      --service ${service}
      --release-version ${getBuildEnvValue('SDK_VERSION')}
      --minified-path-prefix ${prefix}
      --project-path @datadog/browser-${packageName}/
      --repository-url https://www.github.com/datadog/browser-sdk
  `
      .withEnvironment({
        DATADOG_API_KEY: getTelemetryOrgApiKey(site),
        DATADOG_SITE: site,
      })
      .run()
  }
}
