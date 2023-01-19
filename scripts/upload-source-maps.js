'use strict'

const { getSecretKey, command, printLog, runMain } = require('./utils')
const { SDK_VERSION } = require('./build-env')

/**
 * Upload source maps to datadog
 * Usage:
 * BUILD_MODE=canary|release node upload-source-maps.js site1,site2,... staging|canary|vXXX
 */

const sites = process.argv[2].split(',')
const suffix = process.argv[3]
const packages = [
  { name: 'logs', service: 'browser-logs-sdk' },
  { name: 'rum', service: 'browser-rum-sdk' },
  { name: 'rum-slim', service: 'browser-rum-sdk' },
]

function renameFiles(bundleFolder, packageName) {
  // The datadog-ci CLI is taking a directory as an argument. It will scan every source map files in
  // it and upload those along with the minified bundle. The file names must match the one from the
  // CDN, thus we need to rename the bundles with the right suffix.
  for (const ext of ['js', 'js.map']) {
    const filePath = `${bundleFolder}/datadog-${packageName}.${ext}`
    const suffixedFilePath = `${bundleFolder}/datadog-${packageName}-${suffix}.${ext}`
    command`mv ${filePath} ${suffixedFilePath}`.run()
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

runMain(() => {
  for (const { name, service } of packages) {
    const bundleFolder = `packages/${name}/bundle`
    renameFiles(bundleFolder, name)
    for (const site of sites) {
      const normalizedSite = site.replaceAll('.', '-')
      const apiKey = getSecretKey(`ci.browser-sdk.source-maps.${normalizedSite}.ci_api_key`)

      uploadSourceMaps(site, apiKey, name, service, bundleFolder)
    }
  }
  printLog('Source maps upload done.')
})
