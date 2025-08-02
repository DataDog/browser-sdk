import fs from 'node:fs'
import path from 'node:path'

import { printLog, runMain } from '../lib/executionUtils.ts'
import { command } from '../lib/command.ts'
import { modifyFile } from '../lib/filesUtils.ts'

interface ExtensionConfig {
  name: string
  initParameter: string
}

const EXTRA_EXTENSIONS: ExtensionConfig[] = [
  { name: 'allowed-tracking-origin', initParameter: 'allowedTrackingOrigins: [/^chrome-extension:\\/\\//],' },
  { name: 'invalid-tracking-origin', initParameter: "allowedTrackingOrigins: ['https://app.example.com']," },
]

runMain(async () => {
  printLog('Packing packages...')
  command`yarn lerna run pack`.run()

  buildApp('test/apps/vanilla')
  buildApp('test/apps/react')
  buildApp('test/apps/react-v7')
  await buildExtensions()

  printLog('Test apps and extensions built successfully.')
})

function buildApp(appPath: string) {
  printLog(`Building app at ${appPath}...`)
  command`yarn install --no-immutable`.withCurrentWorkingDirectory(appPath).run()
  command`yarn build`.withCurrentWorkingDirectory(appPath).run()
}

async function buildExtensions(): Promise<void> {
  const baseExtDir = 'test/apps/base-extension'

  buildApp(baseExtDir)

  for (const { name, initParameter } of EXTRA_EXTENSIONS) {
    const targetDir = path.join('test/apps', name)

    fs.rmSync(targetDir, { recursive: true, force: true })
    fs.cpSync(baseExtDir, targetDir, { recursive: true })

    const contentScriptPath = path.join(targetDir, 'src/contentScript.ts')
    await modifyFile(contentScriptPath, (content: string) =>
      content.replace(/\/\* EXTENSION_INIT_PARAMETER \*\//g, initParameter)
    )

    buildApp(targetDir)
  }
}
