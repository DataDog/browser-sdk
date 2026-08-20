import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { browserSdkVersion } from './browserSdkVersion.ts'
import { command } from './command.ts'

type BuildMode = 'dev' | 'release' | 'canary'

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

const WORKER_PATH = path.join(import.meta.dirname, '../../packages/browser-worker')

export function getBuildEnvDefines({
  setup,
  version = getBuildEnvSdkVersion(),
  workerString = false,
}: {
  setup: 'npm' | 'cdn'
  version?: string
  workerString?: boolean
}): Record<string, string> {
  return {
    __BUILD_ENV__SDK_VERSION__: JSON.stringify(version),
    __BUILD_ENV__SDK_SETUP__: JSON.stringify(setup),
    ...(workerString && { __BUILD_ENV__WORKER_STRING__: JSON.stringify(getWorkerString()) }),
  }
}

export function getBuildEnvSdkVersion(): string {
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
}

function getWorkerString(): string {
  if (needsWorkerRebuild()) {
    command`yarn build`.withCurrentWorkingDirectory(WORKER_PATH).run()
  }
  return fs.readFileSync(path.join(WORKER_PATH, 'bundle/worker.js'), {
    encoding: 'utf-8',
  })
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

function needsWorkerRebuild(): boolean {
  const bundlePath = path.join(WORKER_PATH, 'bundle/worker.js')

  if (!fs.existsSync(bundlePath)) {
    return true
  }

  const bundleMtime = fs.statSync(bundlePath).mtimeMs

  return fs.globSync('src/**/*', { cwd: WORKER_PATH }).some((file) => {
    const filePath = path.join(WORKER_PATH, file)
    const stats = fs.statSync(filePath)
    return stats.isFile() && stats.mtimeMs > bundleMtime
  })
}
