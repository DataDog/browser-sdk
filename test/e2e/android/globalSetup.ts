import { execSync, spawn } from 'child_process'

const BOOT_TIMEOUT_MS = 120_000
const BOOT_POLL_INTERVAL_MS = 2_000

const DEV_SERVER_PORT = 8080
// Port range matching httpServers.ts
const PORT_RANGE_START = 9200
const PORT_RANGE_END = 9400

// eslint-disable-next-line import/no-default-export
export default async function globalSetup() {
  console.log('Starting Android emulator...')

  const emulatorProcess = spawn(
    'emulator',
    ['-avd', 'test_device', '-no-window', '-no-audio', '-no-snapshot', '-no-boot-anim', '-gpu', 'swiftshader_indirect'],
    {
      stdio: 'inherit',
      detached: true,
    }
  )
  emulatorProcess.unref()

  await waitForBoot()
  setupAdbReverse()

  process.env.ANDROID_E2E = 'true'
}

async function waitForBoot() {
  const startTime = Date.now()

  while (Date.now() - startTime < BOOT_TIMEOUT_MS) {
    try {
      const result = execSync('adb shell getprop sys.boot_completed', { encoding: 'utf-8', timeout: 5_000 }).trim()
      if (result === '1') {
        console.log(`Emulator booted in ${Math.round((Date.now() - startTime) / 1000)}s`)
        return
      }
    } catch {
      // adb not yet connected, keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, BOOT_POLL_INTERVAL_MS))
  }

  throw new Error(`Emulator failed to boot within ${BOOT_TIMEOUT_MS / 1000}s`)
}

function setupAdbReverse() {
  console.log('Setting up adb reverse port forwarding...')

  // Forward dev server port
  execSync(`adb reverse tcp:${DEV_SERVER_PORT} tcp:${DEV_SERVER_PORT}`)

  // Forward test server port range
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    execSync(`adb reverse tcp:${port} tcp:${port}`)
  }

  console.log(`Forwarded ports: ${DEV_SERVER_PORT}, ${PORT_RANGE_START}-${PORT_RANGE_END}`)
}
