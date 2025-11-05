import { readFileSync } from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { browserSdkVersion } from './browserSdkVersion.ts'
import { command } from './command.ts'

type BuildMode = 'dev' | 'release' | 'canary'
type SdkSetup = 'npm' | 'cdn'

/**
 * Allows to define which sdk_version to send to the intake.
 */
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
const SDK_SETUPS: SdkSetup[] = ['npm', 'cdn']

const buildEnvCache = new Map<string, string>()

type BuildEnvFactories = {
  [K in 'SDK_VERSION' | 'SDK_SETUP' | 'WORKER_STRING']: () => string
}

const buildEnvFactories: BuildEnvFactories = {
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
    const workerPath = path.join(import.meta.dirname, '../../packages/worker')
    // Make sure the worker is built
    // TODO: Improve overall built time by rebuilding the worker only if its sources have changed?
    // TODO: Improve developer experience during tests by detecting worker source changes?
    command`yarn build`.withCurrentWorkingDirectory(workerPath).run()
    return readFileSync(path.join(workerPath, 'bundle/worker.js'), {
      encoding: 'utf-8',
    })
  },
}

export const buildEnvKeys = Object.keys(buildEnvFactories) as Array<keyof BuildEnvFactories>

export function getBuildEnvValue(key: keyof BuildEnvFactories): string {
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
  if (BUILD_MODES.includes(process.env.BUILD_MODE as BuildMode)) {
    return process.env.BUILD_MODE as BuildMode
  }
  console.log(`Invalid build mode "${process.env.BUILD_MODE}". Possible build modes are: ${BUILD_MODES.join(', ')}`)
  process.exit(1)
}

function getSdkSetup(): SdkSetup {
  if (!process.env.SDK_SETUP) {
    return SDK_SETUPS[0] // npm
  }
  if (SDK_SETUPS.includes(process.env.SDK_SETUP as SdkSetup)) {
    return process.env.SDK_SETUP as SdkSetup
  }
  console.log(`Invalid SDK setup "${process.env.SDK_SETUP}". Possible SDK setups are: ${SDK_SETUPS.join(', ')}`)
  process.exit(1)
}
