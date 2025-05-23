#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

function log(message) {
  console.log(message)
}

function fail(message) {
  console.error(`\n❌ ${message}\n`)
  process.exit(1)
}

function exec(command, cwd) {
  try {
    return execSync(command, {
      cwd: cwd || process.cwd(),
      stdio: ['inherit', 'pipe', 'inherit'],
    })
      .toString()
      .trim()
  } catch (error) {
    fail(`Command failed: ${command}\n${error.message}`)
  }
}

function buildExtensions() {
  log('Building extensions with different configurations...')

  // Base extension directory
  const baseExtDir = path.join(process.cwd(), 'test/apps/extensions/base')

  // Extension configurations
  const extensionNames = ['allowed-tracking-origin', 'invalid-tracking-origin']
  const trackingOrigins = {
    'allowed-tracking-origin': 'chrome-extension://abcdefghijklmno',
    'invalid-tracking-origin': 'https://app.example.com',
  }

  // 1. Create and build default extension (no parameter replacement)
  log('Building default extension...')
  exec('yarn install --no-immutable', baseExtDir)
  exec('yarn build', baseExtDir)

  // 2. Create and build extensions with different configurations
  for (const extName of extensionNames) {
    const targetDir = path.join(process.cwd(), `test/apps/extensions/${extName}`)
    const trackingOrigin = trackingOrigins[extName]

    log(`Creating ${extName} extension...`)

    // Remove existing directory if it exists
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true })
    }

    // Copy base extension to target directory
    fs.cpSync(baseExtDir, targetDir, { recursive: true })

    // Add the configuration parameter
    const contentScriptPath = path.join(targetDir, 'src/contentScript.js')
    let contentScript = fs.readFileSync(contentScriptPath, 'utf8')
    contentScript = contentScript.replace(
      /\/\* EXTENSION_INIT_PARAMETER \*\//g,
      `allowedTrackingOrigins: ["${trackingOrigin}"],`
    )
    fs.writeFileSync(contentScriptPath, contentScript)

    // Build the extension
    log(`Building ${extName} extension...`)
    exec('yarn install --no-immutable', targetDir)
    exec('yarn build', targetDir)
  }

  log('Extension builds completed successfully.')
  log('Available extensions:')
  log(`  - Default: ${baseExtDir}`)

  for (const extName of extensionNames) {
    log(`  - ${extName}: test/apps/extensions/${extName}`)
  }
}

function runMain() {
  buildExtensions()
}

runMain()
