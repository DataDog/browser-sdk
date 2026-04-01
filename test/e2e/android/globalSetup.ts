import { execSync, spawn } from 'child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

const BOOT_TIMEOUT_MS = 300_000
const BOOT_POLL_INTERVAL_MS = 2_000

const DEV_SERVER_PORT = 8080
// Port range covering httpServers.ts (9200-9400) and dynamic server ports (9000-9199)
const PORT_RANGE_START = 9000
const PORT_RANGE_END = 9400

// eslint-disable-next-line import/no-default-export
export default async function globalSetup() {
  console.log('Starting Android emulator...')

  const emulatorProcess = spawn(
    'emulator',
    [
      '-avd',
      process.env.ANDROID_AVD || 'test_device',
      '-no-window',
      '-no-audio',
      '-no-snapshot',
      '-no-boot-anim',
      '-gpu',
      'auto',
    ],
    {
      stdio: ['ignore', 'ignore', 'ignore'],
      detached: true,
    }
  )
  emulatorProcess.unref()

  await waitForBoot()
  setupAdbReverse()
  await installChromium()
  installWebViewApp()
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
  execSync(`adb reverse tcp:${DEV_SERVER_PORT} tcp:${DEV_SERVER_PORT}`)
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    execSync(`adb reverse tcp:${port} tcp:${port}`)
  }
  console.log(`Forwarded ports: ${DEV_SERVER_PORT}, ${PORT_RANGE_START}-${PORT_RANGE_END}`)
}

const WEBVIEW_APP_PKG = 'com.example.webviewtest'
const WEBVIEW_APK_PATH = path.join(__dirname, '../../apps/android-webview-app/app/build/outputs/apk/debug/app-debug.apk')

function installWebViewApp() {
  console.log('Installing WebView test app...')
  try {
    if (!fs.existsSync(WEBVIEW_APK_PATH)) {
      console.log(`WebView APK not found at ${WEBVIEW_APK_PATH}, skipping WebView tests`)
      return
    }
    const result = execSync(`adb install -r -d "${WEBVIEW_APK_PATH}"`, { encoding: 'utf-8', timeout: 30_000 })
    console.log(`WebView app installed: ${result.trim()}`)
  } catch (error) {
    console.log('WebView app install failed (non-fatal):', error)
  }
}

// The default Chrome on the emulator is too old for modern web APIs.
// Install a recent Chromium from Google's snapshot storage.
async function installChromium() {
  console.log('Installing Chromium on emulator...')

  try {
    const revisionResponse = await fetch(
      'https://storage.googleapis.com/chromium-browser-snapshots/Android_Arm64/LAST_CHANGE'
    )
    const revision = (await revisionResponse.text()).trim()
    console.log(`Latest Chromium ARM64 snapshot revision: ${revision}`)

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

    execSync(`unzip -o "${zipPath}" -d "${tmpDir}"`, { timeout: 60_000 })

    const apks = execSync(`find "${tmpDir}" -name "*.apk"`, { encoding: 'utf-8', timeout: 5_000 })
      .trim()
      .split('\n')
      .filter(Boolean)

    const chromeApk = apks.find((a) => path.basename(a) === 'ChromePublic.apk')
    if (!chromeApk) {
      console.log('ChromePublic.apk not found in download')
      return
    }

    const result = execSync(`adb install -r -d "${chromeApk}"`, { encoding: 'utf-8', timeout: 120_000 })
    console.log(`Install result: ${result.trim()}`)

    const versionInfo = execSync('adb shell dumpsys package org.chromium.chrome | grep versionName', {
      encoding: 'utf-8',
      timeout: 5_000,
    }).trim()
    console.log(`Chromium installed: ${versionInfo}`)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch (error) {
    console.log('Chromium install failed (non-fatal):', error)
  }
}
