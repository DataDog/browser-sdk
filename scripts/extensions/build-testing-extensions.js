#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const { printLog, runMain } = require('../lib/executionUtils')
const { command } = require('../lib/command')
const { modifyFile } = require('../lib/filesUtils')

const EXTENSIONS_INIT_PARAMETERS = {
  'allowed-tracking-origin': 'allowedTrackingOrigins: [/^chrome-extension:\\/\\//],',
  'invalid-tracking-origin': "allowedTrackingOrigins: ['https://app.example.com'],",
}

runMain(async () => {
  await buildExtensions()
})

async function buildExtensions() {
  printLog('Building extensions with different configurations...')

  // Base extension directory
  const baseExtDir = path.join(process.cwd(), 'test/apps/base-extension')

  // Extension configurations
  const extensionNames = Object.keys(EXTENSIONS_INIT_PARAMETERS)

  // 1. Build the base extension first
  printLog('Building base extension...')
  command`yarn install --no-immutable`.withCurrentWorkingDirectory(baseExtDir).withLogs().run()
  command`yarn build`.withCurrentWorkingDirectory(baseExtDir).withLogs().run()

  // 2. Create and build extensions with different configurations
  for (const extName of extensionNames) {
    const targetDir = path.join(process.cwd(), 'test/apps', extName)
    const initParameter = EXTENSIONS_INIT_PARAMETERS[extName]

    printLog(`Creating ${extName} extension...`)

    // Remove existing directory if it exists
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true })
    }

    // Copy base extension to target directory
    fs.cpSync(baseExtDir, targetDir, { recursive: true })

    // Add the configuration parameter
    const contentScriptPath = path.join(targetDir, 'src/contentScript.ts')
    await modifyFile(contentScriptPath, (content) =>
      content.replace(/\/\* EXTENSION_INIT_PARAMETER \*\//g, initParameter)
    )

    // Build the extension
    printLog(`Building ${extName} extension...`)
    command`yarn install --no-immutable`.withCurrentWorkingDirectory(targetDir).withLogs().run()
    command`yarn build`.withCurrentWorkingDirectory(targetDir).withLogs().run()
  }

  printLog('Extension builds completed successfully.')
  printLog('Available extensions:')
  printLog(`  - Base: ${baseExtDir}`)

  for (const extName of extensionNames) {
    printLog(`  - ${extName}: test/apps/${extName}`)
  }
}
