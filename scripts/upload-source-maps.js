'use strict'

const { getSecretKey, executeCommand, printLog, logAndExit } = require('./utils')
const { SDK_VERSION } = require('./build-env')

/**
 * Upload source maps to datadog
 * Usage:
 * BUILD_MODE=canary|release node upload-source-maps.js site1,site2,... staging|canary|vXXX
 */

const sites = process.argv[2].split(',')
const suffix = process.argv[3]

async function renameFiles(bundleFolder, packageName) {
  // The datadog-ci CLI is taking a directory as an argument. It will scan every source map files in
  // it and upload those along with the minified bundle. The file names must match the one from the
  // CDN, thus we need to rename the bundles with the right suffix.
  for (const ext of ['js', 'js.map']) {
    const filePath = `${bundleFolder}/datadog-${packageName}.${ext}`
    const suffixedFilePath = `${bundleFolder}/datadog-${packageName}-${suffix}.${ext}`
    await executeCommand(`mv ${filePath} ${suffixedFilePath}`)
  }
}

async function uploadSourceMaps(site, apiKey, packageName, service, bundleFolder) {
  printLog(`Uploading ${packageName} source maps for ${site}...`)

  const output = await executeCommand(
    `
    datadog-ci sourcemaps upload ${bundleFolder} \
      --service ${service} \
      --release-version ${SDK_VERSION} \
      --minified-path-prefix / \
      --project-path @datadog/browser-${packageName}/ \
      --repository-url https://www.github.com/datadog/browser-sdk \
  `,
    {
      DATADOG_API_KEY: apiKey,
      DATADOG_SITE: site,
    }
  )
  console.log(output)
}

async function main() {
  for (const package of [
    { name: 'logs', service: 'browser-logs-sdk' },
    { name: 'rum', service: 'browser-rum-sdk' },
    { name: 'rum-slim', service: 'browser-rum-sdk' },
  ]) {
    const bundleFolder = `packages/${package.name}/bundle`
    await renameFiles(bundleFolder, package.name)
    for (const site of sites) {
      const normalizedSite = site.replaceAll('.', '-')
      const apiKey = await getSecretKey(`ci.browser-sdk.source-maps.${normalizedSite}.ci_api_key`)

      await uploadSourceMaps(site, apiKey, package.name, package.service, bundleFolder)
    }
  }
  printLog('Source maps upload done.')
}

main().catch(logAndExit)
