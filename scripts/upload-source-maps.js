'use strict'

const { getSecretKey, executeCommand, printLog, logAndExit } = require('./utils')
const { SDK_VERSION } = require('./build-env')

/**
 * Upload source maps to datadog
 * Usage:
 * BUILD_MODE=canary|release node upload-source-maps.js datadoghq.com staging|canary|vXXX
 */

const site = process.argv[2]
const suffix = process.argv[3]

async function uploadSourceMaps(apiKey, packageName) {
  const bundleFolder = `packages/${packageName}/bundle`

  // The datadog-ci CLI is taking a directory as an argument. It will scan every source map files in
  // it and upload those along with the minified bundle. The file names must match the one from the
  // CDN, thus we need to rename the bundles with the right suffix.
  for (const ext of ['js', 'js.map']) {
    const filePath = `${bundleFolder}/datadog-${packageName}.${ext}`
    const suffixedFilePath = `${bundleFolder}/datadog-${packageName}-${suffix}.${ext}`
    await executeCommand(`mv ${filePath} ${suffixedFilePath}`)
  }

  const output = await executeCommand(
    `
    datadog-ci sourcemaps upload ${bundleFolder} \
      --service browser-sdk \
      --release-version ${SDK_VERSION} \
      --minified-path-prefix / \
      --project-path @datadog/browser-${packageName}/ \
  `,
    {
      DATADOG_API_KEY: apiKey,
      DATADOG_SITE: site,
    }
  )
  console.log(output)
}

async function main() {
  const apiKey = await getSecretKey('ci.browser-sdk.datadog_ci_api_key')

  for (const packageName of ['logs', 'rum', 'rum-slim']) {
    await uploadSourceMaps(apiKey, packageName)
  }

  printLog(`Source map upload done.`)
}

main().catch(logAndExit)
