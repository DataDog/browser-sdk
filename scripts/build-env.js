const execSync = require('child_process').execSync
const lernaJson = require('../lerna.json')

/**
 * Allows to produce slightly custom builds of bundles and packages to be used in various
 * environment. In particular, it allows:
 * - some internal uses cases
 * - different strategies for sdk_version sent to the intake (see below)
 */
const BUILD_MODES = [
  // Used while developing. This is the default if the BUILD_MODE environment variable is empty.
  'dev',

  // Used for public releases.
  'release',

  // Used by E2E tests.
  // * Allows intake endpoints overrides when served from the E2E test framework.
  'e2e-test',

  // Used on the production Datadog web app.
  'canary',

  // Used on the staging Datadog web app.
  // * Enables the support of the "replica" options.
  'staging',
]

let buildMode
if (process.env.BUILD_MODE) {
  if (BUILD_MODES.includes(process.env.BUILD_MODE)) {
    buildMode = process.env.BUILD_MODE
  } else {
    console.log(`Invalid build mode "${process.env.BUILD_MODE}". Possible build modes are: ${BUILD_MODES.join(', ')}`)
    process.exit(1)
  }
} else {
  buildMode = BUILD_MODES[0]
}

let sdkVersion
switch (buildMode) {
  case 'release':
    sdkVersion = lernaJson.version
    break
  case 'canary':
  case 'staging':
    const commitSha1 = execSync('git rev-parse HEAD').toString().trim()
    sdkVersion = `${lernaJson.version}+${commitSha1}`
    break
  default:
    sdkVersion = 'dev'
    break
}

module.exports = {
  BUILD_MODE: buildMode,
  SDK_VERSION: sdkVersion,
}
