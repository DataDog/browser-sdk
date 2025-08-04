import fs from 'node:fs'
import path from 'node:path'

import { printLog, runMain } from '../lib/executionUtils.ts'
import { command } from '../lib/command.ts'
import { modifyFile } from '../lib/filesUtils.ts'

interface ExtensionConfig {
  name: string
  initParameter: string
}

interface ReactAppConfig {
  targetDir: string
  appName: string
  routerVersion: string
  routerPackage: string
  routerDependency: string
  outputFilename: string
}

const EXTRA_EXTENSIONS: ExtensionConfig[] = [
  { name: 'allowed-tracking-origin', initParameter: 'allowedTrackingOrigins: [/^chrome-extension:\\/\\//],' },
  { name: 'invalid-tracking-origin', initParameter: "allowedTrackingOrigins: ['https://app.example.com']," },
]

const REACT_APPS: ReactAppConfig[] = [
  {
    targetDir: 'test/apps/react',
    appName: 'react-app',
    routerVersion: 'react-router-v6',
    routerPackage: 'react-router-dom',
    routerDependency: ',\n    "react-router-dom": "6.30.0"',
    outputFilename: 'react-app.js',
  },
  {
    targetDir: 'test/apps/react-v7',
    appName: 'react-app-v7',
    routerVersion: 'react-router-v7',
    routerPackage: 'react-router',
    routerDependency: ',\n    "react-router": "7.0.2"',
    outputFilename: 'react-app-v7.js',
  },
]

runMain(async () => {
  printLog('Packing packages...')
  command`yarn lerna run pack`.run()

  buildApp('test/apps/vanilla')
  await buildReactApps()
  await buildExtensions()

  printLog('Test apps and extensions built successfully.')
})

function buildApp(appPath: string) {
  printLog(`Building app at ${appPath}...`)
  command`yarn install --no-immutable`.withCurrentWorkingDirectory(appPath).run()
  command`yarn build`.withCurrentWorkingDirectory(appPath).run()
}

async function buildReactApps(): Promise<void> {
  const baseReactDir = 'test/apps/base-react'

  for (const { targetDir, appName, routerVersion, routerPackage, routerDependency, outputFilename } of REACT_APPS) {
    printLog(`Generating React app at ${targetDir}...`)

    fs.rmSync(targetDir, { recursive: true, force: true })
    fs.cpSync(baseReactDir, targetDir, { recursive: true })

    const appTsxPath = path.join(targetDir, 'app.tsx')
    await modifyFile(appTsxPath, (content: string) =>
      content
        .replace(/\/\* REACT_ROUTER_VERSION \*\//g, routerVersion)
        .replace(/\/\* REACT_ROUTER_PACKAGE \*\//g, routerPackage)
    )

    const packageJsonPath = path.join(targetDir, 'package.json')
    await modifyFile(packageJsonPath, (content: string) =>
      content
        .replace(/\/\* REACT_APP_NAME \*\//g, appName)
        .replace(/\/\* REACT_ROUTER_DEPENDENCY \*\//g, routerDependency)
    )

    const webpackConfigPath = path.join(targetDir, 'webpack.config.js')
    await modifyFile(webpackConfigPath, (content: string) =>
      content.replace(/\/\* REACT_OUTPUT_FILENAME \*\//g, outputFilename)
    )

    buildApp(targetDir)
  }
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
