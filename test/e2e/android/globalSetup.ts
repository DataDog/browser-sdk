import { execSync, spawn } from 'child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

const BOOT_TIMEOUT_MS = 300_000
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
    ['-avd', 'test_device', '-no-window', '-no-audio', '-no-snapshot', '-no-boot-anim', '-gpu', 'auto'],
    {
      stdio: ['ignore', 'ignore', 'ignore'],
      detached: true,
    }
  )
  emulatorProcess.unref()

  await waitForBoot()
  setupAdbReverse()
  await installChromium()

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

async function installChromium() {
  // The system Chrome on the emulator is v113, which is too old for many web APIs
  // (LoAf, modern resource timing, etc.). Install a recent Chromium from snapshots.
  console.log('Installing Chromium on emulator...')

  try {
    // Get the latest Chromium snapshot revision for Android ARM64
    const revisionResponse = await fetch(
      'https://storage.googleapis.com/chromium-browser-snapshots/Android_Arm64/LAST_CHANGE'
    )
    const revision = (await revisionResponse.text()).trim()
    console.log(`Latest Chromium ARM64 snapshot revision: ${revision}`)

    // Download the Chromium Android ARM64 build
    const downloadUrl = `https://storage.googleapis.com/chromium-browser-snapshots/Android_Arm64/${revision}/chrome-android.zip`
    console.log(`Downloading from ${downloadUrl}`)

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromium-android-'))
    const zipPath = path.join(tmpDir, 'chrome-android.zip')

    const downloadResponse = await fetch(downloadUrl)
    if (!downloadResponse.ok) {
      console.log(`Download failed: ${downloadResponse.status}`)
      return
    }

    const buffer = Buffer.from(await downloadResponse.arrayBuffer())
    fs.writeFileSync(zipPath, buffer)
    console.log(`Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)}MB`)

    // Extract the zip
    execSync(`unzip -o "${zipPath}" -d "${tmpDir}"`, { timeout: 60_000 })

    // Find APKs
    const apks = execSync(`find "${tmpDir}" -name "*.apk"`, { encoding: 'utf-8', timeout: 5_000 })
      .trim()
      .split('\n')
      .filter(Boolean)

    console.log(`Found APKs: ${apks.map((a) => path.basename(a)).join(', ')}`)

    // Install ChromePublic.apk (the main Chromium browser)
    const chromeApk = apks.find((a) => path.basename(a) === 'ChromePublic.apk')
    if (!chromeApk) {
      console.log('ChromePublic.apk not found in download')
      return
    }

    const result = execSync(`adb install -r -d "${chromeApk}"`, { encoding: 'utf-8', timeout: 120_000 })
    console.log(`Install result: ${result.trim()}`)

    // Log the installed Chromium version
    const versionInfo = execSync('adb shell dumpsys package org.chromium.chrome | grep versionName', {
      encoding: 'utf-8',
      timeout: 5_000,
    }).trim()
    console.log(`Chromium installed: ${versionInfo}`)

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch (error) {
    console.log('Chromium install failed (non-fatal):', error)
  }
}
