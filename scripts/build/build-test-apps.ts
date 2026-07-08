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

interface TestAppPackageJson {
  name: string
  dependencies: Record<string, string>
}

const APPS: AppConfig[] = [
  { name: 'vanilla' },
  { name: 'react-heavy-spa' },
  { name: 'react-shopist-like' },
  { name: 'microfrontend' },
  { name: 'nextjs' },
  { name: 'angular-app' },
  { name: 'vue-router-app' },
  { name: 'nuxt-app' },
  { name: 'instrumentation-overhead' },
  { name: 'sf-lwc-app', builderFn: buildSalesforceApp },
  { name: 'sf-experience-app', builderFn: buildSalesforceApp },

  // React Router apps
  { name: 'react-router-app' },
  { name: 'tanstack-router-app' },
  { name: 'react-router-v6-app', builderFn: buildReactRouterV6App, deps: ['react-router-app'] },

  // Vue Router apps
  { name: 'vue-router-v4-app', builderFn: buildVueRouterV4App, deps: ['vue-router-app'] },
  { name: 'nuxt-vue-router-v4-app', builderFn: buildNuxtVueRouterV4App, deps: ['nuxt-app'] },

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

  const buildPromises = new Map<string, Promise<void>>()

  function ensureBuild(app: AppConfig): Promise<void> {
    let promise = buildPromises.get(app.name)
    if (!promise) {
      promise = (async () => {
        // Ensure all dependencies are built
        const dependenciesToBuild = (app.deps ?? []).map((name) => APPS.find((a) => a.name === name)!)
        await Promise.all(dependenciesToBuild.map(ensureBuild))

        if ('builderFn' in app) {
          await app.builderFn(app.name, app.options)
        } else {
          await buildApp(app.name)
        }
      })()
      buildPromises.set(app.name, promise)
    }
    return promise
  }

  await Promise.all(appsToBuild.map(ensureBuild))

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

async function buildApp(appName: string) {
  try {
    const appPath = `test/apps/${appName}`
    printLog(`Building app at ${appPath}...`)
    await command`yarn install --no-immutable`.withCurrentWorkingDirectory(appPath).runAsync()

    // install peer dependencies if any
    // intent: renovate does not allow to generate local packages before install
    // so local packages are marked as optional peer dependencies and only installed when we build the test apps
    const packageJson = JSON.parse(fs.readFileSync(path.join(appPath, 'package.json'), 'utf-8'))
    if (packageJson.peerDependencies) {
      // For each peer dependency, install it
      for (const [name] of Object.entries(packageJson.peerDependencies)) {
        const resolution = packageJson.resolutions?.[name]
        const specifier = resolution ? `${name}@${resolution}` : name
        await command`yarn add -D ${specifier}`.withCurrentWorkingDirectory(appPath).runAsync()
      }
      // revert package.json & yarn.lock changes if they are versioned
      const areFilesVersioned = await command`git ls-files package.json yarn.lock`
        .withCurrentWorkingDirectory(appPath)
        .runAsync()
      if (areFilesVersioned) {
        await command`git checkout package.json yarn.lock`.withCurrentWorkingDirectory(appPath).runAsync()
      }
    }

    await command`yarn build`.withCurrentWorkingDirectory(appPath).runAsync()
  } catch (error) {
    throw new Error(`Failed to build app '${appName}'`, { cause: error })
  }
}

function buildSalesforceApp(appName: string) {
  const sourceBundle = 'packages/browser-rum-slim/bundle/datadog-rum-slim.js'
  const targetBundle = `test/apps/${appName}/force-app/main/default/staticresources/datadog_rum_slim.js`

  printLog(`Building app at test/apps/${appName}...`)
  fs.copyFileSync(sourceBundle, targetBundle)
}

async function buildReactRouterV6App() {
  await buildGeneratedApp('react-router-app', 'react-router-v6-app', async (appPath) => {
    await modifyFile(path.join(appPath, 'package.json'), (content: string) =>
      content
        .replace(/"name": "react-router-app"/, '"name": "react-router-v6-app"')
        .replace(/"react-router": "[^"]*"/, '"react-router-dom": "6.30.0"')
    )

    await modifyFile(path.join(appPath, 'app.tsx'), (content: string) =>
      content
        .replace('@datadog/browser-rum-react/react-router-v7', '@datadog/browser-rum-react/react-router-v6')
        .replace("from 'react-router'", "from 'react-router-dom'")
        // Remove the v7-only onError prop
        .replace(
          `<RouterProvider
      router={router}
      onError={(error: unknown) => {
        const el = document.createElement('div')
        el.setAttribute('data-testid', 'on-error-fired')
        el.textContent = (error as Error).message ?? String(error)
        document.body.appendChild(el)
      }}
    />`,
          '<RouterProvider router={router} />'
        )
    )

    await modifyFile(path.join(appPath, 'webpack.config.js'), (content: string) =>
      content
        .replace('react-router-app.js', 'react-router-v6-app.js')
        .replace('react-router-app.js', 'react-router-v6-app.js')
    )
  })
}

async function buildVueRouterV4App() {
  await buildGeneratedApp('vue-router-app', 'vue-router-v4-app', async (appPath) => {
    await modifyPackageJson(appPath, (packageJson) => {
      packageJson.name = 'vue-router-v4-app'
      packageJson.dependencies['vue-router'] = '4.6.4'
    })
  })
}

async function buildNuxtVueRouterV4App() {
  await buildGeneratedApp('nuxt-app', 'nuxt-vue-router-v4-app', async (appPath) => {
    await modifyPackageJson(appPath, (packageJson) => {
      packageJson.name = 'nuxt-vue-router-v4-app'
      packageJson.dependencies.nuxt = '3.21.6'
      packageJson.dependencies['vue-router'] = '4.6.4'
    })
  })
}

async function buildGeneratedApp(baseAppName: string, appName: string, modifyApp: (appPath: string) => Promise<void>) {
  const baseAppPath = `test/apps/${baseAppName}`
  const appPath = `test/apps/${appName}`

  fs.rmSync(appPath, { recursive: true, force: true })
  fs.cpSync(baseAppPath, appPath, { recursive: true })

  await modifyApp(appPath)
  await buildApp(appName)
}

async function modifyPackageJson(appPath: string, update: (packageJson: TestAppPackageJson) => void) {
  await modifyFile(path.join(appPath, 'package.json'), (content: string) => {
    const packageJson = JSON.parse(content) as TestAppPackageJson
    update(packageJson)
    return `${JSON.stringify(packageJson, null, 2)}\n`
  })
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
