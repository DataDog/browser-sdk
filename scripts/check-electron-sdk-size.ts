import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { printLog, printError, runMain, formatSize } from './lib/executionUtils.ts'
import { command } from './lib/command.ts'

const SAMPLE_APP_NAME = 'electron-size-test-app'

runMain(() => {
  printLog('Starting Electron SDK size check...\n')

  // Create temporary directory for the sample app
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'electron-sdk-size-'))
  const appDir = path.join(tempDir, SAMPLE_APP_NAME)

  try {
    printLog(`Creating sample Electron app in ${appDir} ...`)
    createElectronApp(tempDir)

    printLog('Packaging base app...')
    const baseSize = packageApp(appDir)
    printLog(`Base app size: ${formatSize(baseSize)}\n`)

    printLog('Installing Electron SDK...')
    installElectronSdk(appDir)

    printLog('Instrumenting app with SDK...')
    instrumentApp(appDir)

    printLog('Packaging instrumented app...')
    const instrumentedSize = packageApp(appDir)
    printLog(`Instrumented app size: ${formatSize(instrumentedSize)}\n`)

    // Calculate overhead
    const overhead = instrumentedSize - baseSize

    printLog(`SDK Overhead: ${formatSize(overhead, { includeSign: true })}`)
  } catch (error) {
    printError('Failed to check Electron SDK size:', error)
    throw error
  } finally {
    // Cleanup temporary directory
    printLog('\nCleaning up temporary files...')
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

function createElectronApp(tempDir: string): void {
  // Use create-electron-app to scaffold a new app
  // Using --template=webpack to get a standard webpack-based setup
  command`npm create electron-app@latest ${SAMPLE_APP_NAME} -- --template=webpack`
    .withCurrentWorkingDirectory(tempDir)
    .run()
}

function installElectronSdk(appDir: string): void {
  const electronPackagePath = path.join(import.meta.dirname, '../packages/electron')
  const browserRumPackagePath = path.join(import.meta.dirname, '../packages/rum')

  command`yarn build`.withCurrentWorkingDirectory(electronPackagePath).run()

  command`npm install @datadog/electron@file:${electronPackagePath}`.withCurrentWorkingDirectory(appDir).run()
  command`npm install @datadog/browser-rum@file:${browserRumPackagePath}`.withCurrentWorkingDirectory(appDir).run()
}

function instrumentApp(appDir: string): void {
  // Update the main entry point to initialize the SDK
  // Electron Forge with webpack template uses src/main.js as the main entry
  const mainJsPath = path.join(appDir, 'src', 'main.js')
  const currentMainJs = fs.readFileSync(mainJsPath, 'utf8')

  const instrumentedMainJs = `const { ddElectron, monitorIpcMain } = require('@datadog/electron/main');
const ipcMain = monitorIpcMain()
// Initialize Datadog Electron SDK
ddElectron.init({
  clientToken: 'pub0000000000000000000000000000000',
  site: 'datadoghq.com',
  service: 'electron-size-test',
  env: 'test',
});

${currentMainJs}
`
  fs.writeFileSync(mainJsPath, instrumentedMainJs)

  const preloadJsPath = path.join(appDir, 'src', 'preload.js')
  const currentPreloadJs = fs.readFileSync(preloadJsPath, 'utf8')

  const instrumentedPreloadJs = `const { setupRendererBridge } = require('@datadog/electron/preload');

setupRendererBridge()
const ipcRenderer = monitorIpcRenderer()

${currentPreloadJs}
`
  fs.writeFileSync(preloadJsPath, instrumentedPreloadJs)

  const rendererJsPath = path.join(appDir, 'src', 'preload.js')
  const currentRendererJs = fs.readFileSync(rendererJsPath, 'utf8')

  const instrumentedRendererJs = `const { electronPlugin } = require('@datadog/electron/renderer');
  const { datadogRum } = require('@datadog/browser-rum');

datadogRum.init({
  applicationId: 'xxx',
  clientToken: 'xxx',
  plugins: [electronPlugin()]
})

${currentRendererJs}
`
  fs.writeFileSync(rendererJsPath, instrumentedRendererJs)
}

function packageApp(appDir: string): number {
  // Clean previous build
  const outDir = path.join(appDir, 'out')
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true })
  }

  // Package the app using electron-forge
  command`npm run package`.withCurrentWorkingDirectory(appDir).run()

  // Find the macOS .app bundle
  const appBundlePath = findMacOSAppBundle(outDir)

  if (!appBundlePath) {
    throw new Error('Could not find .app bundle in out directory')
  }

  // Calculate size of the entire app bundle
  return getDirectorySize(appBundlePath)
}

function findMacOSAppBundle(outDir: string): string | null {
  // On macOS, Electron Forge outputs: out/electron-size-test-app-darwin-arm64/electron-size-test-app.app
  const pattern = path.join(outDir, '**/*.app')
  const matches = fs.globSync(pattern, { cwd: outDir })

  if (matches.length > 0) {
    const match = matches[0]
    return path.isAbsolute(match) ? match : path.join(outDir, match)
  }

  return null
}

function getDirectorySize(dirPath: string): number {
  // Use du utility to calculate disk usage
  // -s: display only total for each argument
  // -k: show size in kilobytes
  const output = command`du -sk ${dirPath}`.run()

  // du output format: "12345\t/path/to/directory"
  const sizeInKb = parseInt(output.split('\t')[0], 10)

  // Convert kilobytes to bytes
  return sizeInKb * 1024
}
