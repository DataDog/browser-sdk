'use strict'

const { getSecretKey, command, printLog, runMain } = require('./utils')
const { SDK_VERSION } = require('./build-env')

/**
 * Upload source maps to datadog
 * Usage:
 * BUILD_MODE=canary|release node upload-source-maps.js staging|canary|vXXX
 */

const version = process.argv[2]
const packages = [
  { name: 'logs', service: 'browser-logs-sdk' },
  { name: 'rum', service: 'browser-rum-sdk' },
  { name: 'rum-slim', service: 'browser-rum-sdk' },
]
const sitesByVersion = {
  staging: ['datad0g.com', 'datadoghq.com'],
  canary: ['datadoghq.com'],
  v4: ['datadoghq.com', 'datadoghq.eu', 'us3.datadoghq.com', 'us5.datadoghq.com', 'ap1.datadoghq.com'],
}

runMain(() => {
  for (const { name, service } of packages) {
    const bundleFolder = `packages/${name}/bundle`
    renameFilesWithVersionSuffix(bundleFolder, name)
    for (const site of sitesByVersion[version]) {
      const normalizedSite = site.replaceAll('.', '-')
      const apiKey = getSecretKey(`ci.browser-sdk.source-maps.${normalizedSite}.ci_api_key`)

      uploadSourceMaps(site, apiKey, name, service, bundleFolder)
    }
  }
  printLog('Source maps upload done.')
})

function renameFilesWithVersionSuffix(bundleFolder, packageName) {
  // The datadog-ci CLI is taking a directory as an argument. It will scan every source map files in
  // it and upload those along with the minified bundle. The file names must match the one from the
  // CDN, thus we need to rename the bundles with the right suffix.
  for (const ext of ['js', 'js.map']) {
    const sourceFilePath = `${bundleFolder}/datadog-${packageName}.${ext}`
    const targetFilePath = `${bundleFolder}/datadog-${packageName}-${version}.${ext}`
    command`mv ${sourceFilePath} ${targetFilePath}`.run()
  }
}

function uploadSourceMaps(site, apiKey, packageName, service, bundleFolder) {
  printLog(`Uploading ${packageName} source maps for ${site}...`)

  command`
    datadog-ci sourcemaps upload ${bundleFolder}
      --service ${service}
      --release-version ${SDK_VERSION}
      --minified-path-prefix /
      --project-path @datadog/browser-${packageName}/
      --repository-url https://www.github.com/datadog/browser-sdk
  `
    .withEnvironment({
      DATADOG_API_KEY: apiKey,
      DATADOG_SITE: site,
    })
    .run()
}
