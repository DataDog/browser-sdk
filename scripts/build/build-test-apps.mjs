import fs from 'fs'
import path from 'path'

import { printLog, runMain } from '../lib/executionUtils.js'
import { command } from '../lib/command.js'
import { modifyFile } from '../lib/filesUtils.js'

const EXTRA_EXTENSIONS = [
  { name: 'allowed-tracking-origin', initParameter: 'allowedTrackingOrigins: [/^chrome-extension:\\/\\//],' },
  { name: 'invalid-tracking-origin', initParameter: "allowedTrackingOrigins: ['https://app.example.com']," },
]

runMain(async () => {
  printLog('Packing packages...')
  command`yarn lerna run pack`.run()

  buildApp('test/apps/vanilla')
  buildApp('test/apps/react')
  await buildExtensions()

  printLog('Test apps and extensions built successfully.')
})

function buildApp(appPath) {
  printLog(`Building app at ${appPath}...`)
  command`yarn install --no-immutable`.withCurrentWorkingDirectory(appPath).run()
  command`yarn build`.withCurrentWorkingDirectory(appPath).run()
}

async function buildExtensions() {
  const baseExtDir = 'test/apps/base-extension'

  buildApp(baseExtDir)

  for (const { name, initParameter } of EXTRA_EXTENSIONS) {
    const targetDir = path.join('test/apps', name)

    fs.rmSync(targetDir, { recursive: true, force: true })
    fs.cpSync(baseExtDir, targetDir, { recursive: true })

    const contentScriptPath = path.join(targetDir, 'src/contentScript.ts')
    await modifyFile(contentScriptPath, (content) =>
      content.replace(/\/\* EXTENSION_INIT_PARAMETER \*\//g, initParameter)
    )

    buildApp(targetDir)
  }
}
