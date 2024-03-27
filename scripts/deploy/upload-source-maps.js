'use strict'

const path = require('path')
const { printLog, runMain } = require('../lib/execution-utils')
const { command } = require('../lib/command')
const { getBuildEnvValue } = require('../lib/build-env')
const { getTelemetryOrgApiKey } = require('../lib/secrets')
const { siteByDatacenter } = require('../lib/datadog-sites')
const {
  buildRootUploadPath,
  buildDatacenterUploadPath,
  buildBundleFolder,
  buildBundleFileName,
  packages,
} = require('./lib/deployment-utils')

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

runMain(() => {
  for (const { packageName, service } of packages) {
    const bundleFolder = buildBundleFolder(packageName)
    for (const uploadPathType of uploadPathTypes) {
      let sites
      let uploadPath
      if (uploadPathType === 'root') {
        sites = getSitesByVersion(version)
        uploadPath = buildRootUploadPath(packageName, version)
        renameFilesWithVersionSuffix(packageName, bundleFolder)
      } else {
        sites = [siteByDatacenter[uploadPathType]]
        uploadPath = buildDatacenterUploadPath(uploadPathType, packageName, version)
      }
      const prefix = path.dirname(`/${uploadPath}`)
      uploadSourceMaps(packageName, service, prefix, bundleFolder, sites)
    }
  }
  printLog('Source maps upload done.')
})

function renameFilesWithVersionSuffix(packageName, bundleFolder) {
  // The datadog-ci CLI is taking a directory as an argument. It will scan every source map files in
  // it and upload those along with the minified bundle. The file names must match the one from the
  // CDN, thus we need to rename the bundles with the right suffix.
  for (const extension of ['js', 'js.map']) {
    const bundlePath = `${bundleFolder}/${buildBundleFileName(packageName, extension)}`
    const uploadPath = `${bundleFolder}/${buildRootUploadPath(packageName, version, extension)}`
    command`mv ${bundlePath} ${uploadPath}`.run()
  }
}

function uploadSourceMaps(packageName, service, prefix, bundleFolder, sites) {
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
