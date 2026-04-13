import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { printLog, runMain } from '../lib/executionUtils.ts'
import { command } from '../lib/command.ts'
import { modifyFile } from '../lib/filesUtils.ts'

type AppConfig<T extends AppBuilderOptions = AppBuilderOptions> =
  | {
      name: string
      deps?: string[]
    }
  | {
      name: string
      builderFn(appName: string, options?: T): Promise<void> | void
      options?: T
      deps?: string[]
    }

type AppBuilderOptions = Record<string, unknown>

const APPS: AppConfig[] = [
  { name: 'vanilla' },
  { name: 'react-heavy-spa' },
  { name: 'react-shopist-like' },
  { name: 'microfrontend' },
  { name: 'nextjs' },
  { name: 'angular-app' },
  { name: 'vue-router-app' },
  { name: 'nuxt-app' },

  // React Router apps
  { name: 'react-router-v6-app' },
  { name: 'react-router-v7-app', builderFn: buildReactRouterv7App },

  // browser extensions
  { name: 'base-extension' },
  {
    name: 'cdn-extension',
    builderFn: buildExtension,
    deps: ['base-extension'],
  },
  {
    name: 'appendChild-extension',
    builderFn: buildExtension,
    options: { runAt: 'document_start' },
    deps: ['base-extension'],
  },
]

runMain(async () => {
  const { values } = parseArgs({
    options: {
      app: {
        type: 'string',
        multiple: true,
        short: 'a',
      },
      help: {
        type: 'boolean',
        short: 'h',
      },
    },
  })

  if (values.help) {
    showHelpAndExit()
  }

  const appsToBuild = values.app ? APPS.filter((app) => values.app!.includes(app.name)) : APPS

  if (appsToBuild.length === 0) {
    printLog('No valid app specified. Use --help to see available options.')
    process.exit(1)
  }

  printLog('Packing packages...')
  command`yarn run pack`.run()

  const built = new Set<string>()
  for (const app of appsToBuild) {
    for (const dep of app.deps ?? []) {
      if (!built.has(dep)) {
        buildApp(dep)
        built.add(dep)
      }
    }
    if ('builderFn' in app) {
      await app.builderFn(app.name, app.options)
    } else {
      buildApp(app.name)
    }
    built.add(app.name)
  }

  printLog('Test apps and extensions built successfully.')
})

function showHelpAndExit() {
  console.log('Usage: node build-test-apps.ts [--app <name>] [--help]')
  console.log('')
  console.log('Options:')
  console.log('  --app, -a  Build a specific app (can be repeated for multiple apps)')
  console.log('  --help, -h  Show this help message')
  console.log('')
  console.log('Available apps:')
  for (const app of APPS) {
    console.log(`  ${app.name}`)
  }
  process.exit(0)
}

function buildApp(appName: string) {
  const appPath = `test/apps/${appName}`
  printLog(`Building app at ${appPath}...`)
  command`yarn install --no-immutable`.withCurrentWorkingDirectory(appPath).run()

  // install peer dependencies if any
  // intent: renovate does not allow to generate local packages before install
  // so local packages are marked as optional peer dependencies and only installed when we build the test apps
  const packageJson = JSON.parse(fs.readFileSync(path.join(appPath, 'package.json'), 'utf-8'))
  if (packageJson.peerDependencies) {
    // For each peer dependency, install it
    for (const [name] of Object.entries(packageJson.peerDependencies)) {
      command`yarn add -D ${name}`.withCurrentWorkingDirectory(appPath).run()
    }
    // revert package.json & yarn.lock changes if they are versioned
    const areFilesVersioned = command`git ls-files package.json yarn.lock`.withCurrentWorkingDirectory(appPath).run()
    if (areFilesVersioned) {
      command`git checkout package.json yarn.lock`.withCurrentWorkingDirectory(appPath).run()
    }
  }

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

  buildApp('react-router-v7-app')
}

async function buildExtension(appName: string, options?: { runAt?: string }): Promise<void> {
  const baseExtDir = 'test/apps/base-extension'
  const targetDir = `test/apps/${appName}`

  printLog(`Building app at ${targetDir}...`)

  fs.rmSync(targetDir, { recursive: true, force: true })
  fs.cpSync(baseExtDir, targetDir, { recursive: true })

  const manifestPath = path.join(targetDir, 'manifest.json')
  await modifyFile(manifestPath, (originalContent: string) => {
    const filename = appName.replace('-extension', '')
    let content = originalContent.replace('dist/base.js', `dist/${filename}.js`)

    if (options?.runAt) {
      content = content.replace('document_end', options.runAt)
    }
    return content
  })
}
