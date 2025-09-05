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
  buildApp('test/apps/react-router-v6-app')
  buildApp('test/apps/cdn-extension')
  await buildReactRouterv7App()
  await buildExtensions()

  printLog('Test apps and extensions built successfully.')
})

function buildApp(appPath: string) {
  printLog(`Building app at ${appPath}...`)
  command`yarn install --no-immutable`.withCurrentWorkingDirectory(appPath).run()
  command`yarn build`.withCurrentWorkingDirectory(appPath).run()
}

async function buildReactRouterv7App() {
  const baseAppPath = 'test/apps/react-router-v6-app'
  const appPath = 'test/apps/react-router-v7-app'

  fs.rmSync(appPath, { recursive: true, force: true })
  fs.cpSync(baseAppPath, appPath, { recursive: true })

  await modifyFile(path.join(appPath, 'package.json'), (content: string) =>
    content
      .replace(/"name": "react-router-v6-app"/, '"name": "react-router-v7-app"')
      .replace(/"react-router-dom": "[^"]*"/, '"react-router": "7.0.2"')
  )

  await modifyFile(path.join(appPath, 'app.tsx'), (content: string) =>
    content
      .replace('@datadog/browser-rum-react/react-router-v6', '@datadog/browser-rum-react/react-router-v7')
      .replace("from 'react-router-dom'", "from 'react-router'")
  )

  await modifyFile(path.join(appPath, 'webpack.config.js'), (content: string) =>
    content
      .replace('react-router-v6-app.js', 'react-router-v7-app.js')
      .replace('react-router-v6-app.js', 'react-router-v7-app.js')
  )

  buildApp(appPath)
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
