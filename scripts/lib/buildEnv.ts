import { readFileSync } from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { browserSdkVersion } from './browserSdkVersion'
import { command } from './command'

/**
 * Allows to define which sdk_version to send to the intake.
 */
type BuildMode = 'dev' | 'release' | 'canary'
const BUILD_MODES: BuildMode[] = [
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
type SdkSetup = 'npm' | 'cdn'
const SDK_SETUPS: SdkSetup[] = ['npm', 'cdn']

type BuildEnvKey = 'SDK_VERSION' | 'SDK_SETUP' | 'WORKER_STRING'

const buildEnvCache = new Map<BuildEnvKey, string>()

const buildEnvFactories: Record<BuildEnvKey, () => string> = {
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

export const buildEnvKeys = Object.keys(buildEnvFactories) as BuildEnvKey[]

export function getBuildEnvValue(key: BuildEnvKey): string {
  let value = buildEnvCache.get(key)
  if (!value) {
    value = buildEnvFactories[key]()
    buildEnvCache.set(key, value)
  }
  return value
}

function getBuildMode(): BuildMode {
  if (!process.env.BUILD_MODE) {
    return BUILD_MODES[0]
  }
  if ((BUILD_MODES as string[]).includes(process.env.BUILD_MODE)) {
    return process.env.BUILD_MODE as BuildMode
  }
  console.log(`Invalid build mode "${process.env.BUILD_MODE}". Possible build modes are: ${BUILD_MODES.join(', ')}`)
  process.exit(1)
  return BUILD_MODES[0] // This line will never be reached but satisfies TypeScript
}

function getSdkSetup(): SdkSetup {
  if (!process.env.SDK_SETUP) {
    return SDK_SETUPS[0] // npm
  }
  if ((SDK_SETUPS as string[]).includes(process.env.SDK_SETUP)) {
    return process.env.SDK_SETUP as SdkSetup
  }
  console.log(`Invalid SDK setup "${process.env.SDK_SETUP}". Possible SDK setups are: ${SDK_SETUPS.join(', ')}`)
  process.exit(1)
  return SDK_SETUPS[0] // This line will never be reached but satisfies TypeScript
}
