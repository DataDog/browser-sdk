const { readFileSync } = require('fs')
const path = require('path')
const execSync = require('child_process').execSync
const { browserSdkVersion } = require('./browser-sdk-version')
const { command } = require('./command')

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

/**
 * Allows to define which sdk setup to send to the telemetry.
 */
const SDK_SETUPS = ['npm', 'cdn']

const buildEnvCache = new Map()

const buildEnvFactories = {
  SDK_VERSION: () => {
    switch (getBuildMode()) {
      case 'release':
        return browserSdkVersion
      case 'canary': {
        const commitSha1 = execSync('git rev-parse HEAD').toString().trim()
        // TODO when tags would allow '+' characters
        //  use build separator (+) instead of prerelease separator (-)
        return `${browserSdkVersion}-${commitSha1}`
      }
      default:
        return 'dev'
    }
  },
  SDK_SETUP: () => getSdkSetup(),
  WORKER_STRING: () => {
    const workerPath = path.join(__dirname, '../../packages/worker')
    // Make sure the worker is built
    // TODO: Improve overall built time by rebuilding the worker only if its sources have changed?
    // TODO: Improve developer experience during tests by detecting worker source changes?
    command`yarn build`.withCurrentWorkingDirectory(workerPath).run()
    return readFileSync(path.join(workerPath, 'bundle/worker.js'), {
      encoding: 'utf-8',
    })
  },
}

module.exports = {
  buildEnvKeys: Object.keys(buildEnvFactories),

  getBuildEnvValue: (key) => {
    let value = buildEnvCache.get(key)
    if (!value) {
      value = buildEnvFactories[key]()
      buildEnvCache.set(key, value)
    }
    return value
  },
}

function getBuildMode() {
  if (!process.env.BUILD_MODE) {
    return BUILD_MODES[0]
  }
  if (BUILD_MODES.includes(process.env.BUILD_MODE)) {
    return process.env.BUILD_MODE
  }
  console.log(`Invalid build mode "${process.env.BUILD_MODE}". Possible build modes are: ${BUILD_MODES.join(', ')}`)
  process.exit(1)
}

function getSdkSetup() {
  if (!process.env.SDK_SETUP) {
    return SDK_SETUPS[0] // npm
  }
  if (SDK_SETUPS.includes(process.env.SDK_SETUP)) {
    return process.env.SDK_SETUP
  }
  console.log(`Invalid SDK setup "${process.env.SDK_SETUP}". Possible build modes are: ${SDK_SETUPS.join(', ')}`)
  process.exit(1)
}
