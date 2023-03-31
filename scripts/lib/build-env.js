const execSync = require('child_process').execSync
const lernaJson = require('../../lerna.json')

/**
 * Allows to define which sdk_version to send to the intake.
 */
const BUILD_MODES = [
  // Used while developing. This is the default if the BUILD_MODE environment variable is empty.
  'dev',

  // Used for public releases.
  'release',

  // Used on staging and production Datadog web app.
  'canary',
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
  case 'canary': {
    const commitSha1 = execSync('git rev-parse HEAD').toString().trim()
    sdkVersion = `${lernaJson.version}+${commitSha1}`
    break
  }
  default:
    sdkVersion = 'dev'
    break
}

module.exports = {
  SDK_VERSION: sdkVersion,
}
