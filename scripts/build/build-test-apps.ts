import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import rumReactPackageJson from '../../packages/browser-rum-react/package.json' with { type: 'json' }
import rumNextjsPackageJson from '../../packages/browser-rum-nextjs/package.json' with { type: 'json' }

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
  { name: 'nextjs-v13-app', builderFn: buildNextjsV13App, deps: ['nextjs'] },
  { name: 'angular-app' },
  { name: 'vue-router-app' },
  { name: 'nuxt-app' },
  { name: 'instrumentation-overhead' },

  // React Router apps
  { name: 'react-router-app' },
  { name: 'tanstack-router-app' },
  { name: 'react-router-v6-app', builderFn: buildReactRouterV6App, deps: ['react-router-app'] },
  { name: 'react-router-v7-app', builderFn: buildReactRouterV7App, deps: ['react-router-app'] },

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

  // Salesforce apps
  { name: 'sf-lwc-app', builderFn: buildSalesforceApp },
  { name: 'sf-experience-app', builderFn: buildSalesforceApp },
  {
    name: 'sf-experience-headmarkup-app',
    builderFn: buildExperienceHeadMarkupApp,
    deps: ['sf-experience-app'],
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
          await buildApp(app.name, { restorePackageFiles: true })
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

async function buildApp(appName: string, { restorePackageFiles = false }: { restorePackageFiles?: boolean } = {}) {
  try {
    const appPath = `test/apps/${appName}`
    printLog(`Building app at ${appPath}...`)

    await restoreFilesAfter(
      restorePackageFiles ? ['package.json', 'yarn.lock'].map((fileName) => path.join(appPath, fileName)) : [],
      async () => {
        await command`yarn install --no-immutable`.withCurrentWorkingDirectory(appPath).runAsync()

        // Renovate cannot generate local packages before install, so local packages are marked as optional peer dependencies.
        // Install them only when building the test apps.
        const packageJson = JSON.parse(fs.readFileSync(path.join(appPath, 'package.json'), 'utf-8'))
        if (packageJson.peerDependencies) {
          // For each peer dependency, install it
          for (const [name] of Object.entries(packageJson.peerDependencies)) {
            const resolution = packageJson.resolutions?.[name]
            const specifier = resolution ? `${name}@${resolution}` : name
            await command`yarn add -D ${specifier}`.withCurrentWorkingDirectory(appPath).runAsync()
          }
        }
      }
    )

    await command`yarn build`.withCurrentWorkingDirectory(appPath).runAsync()
  } catch (error) {
    throw new Error(`Failed to build app '${appName}'`, { cause: error })
  }
}

async function restoreFilesAfter<T>(filePaths: string[], action: () => Promise<T>): Promise<T> {
  const restoreFiles = filePaths.map((filePath) => {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath)
      return () => fs.writeFileSync(filePath, content)
    }
    return () => fs.rmSync(filePath, { force: true })
  })

  try {
    return await action()
  } finally {
    for (const restoreFile of restoreFiles) {
      restoreFile()
    }
  }
}

function buildSalesforceApp(appName: string) {
  const sourceBundle = 'packages/browser-rum/bundle/datadog-rum-salesforce.js'
  const targetBundle = `test/apps/${appName}/force-app/main/default/staticresources/datadog_rum_salesforce.js`

  printLog(`Building app at test/apps/${appName}...`)
  fs.copyFileSync(sourceBundle, targetBundle)
}

async function buildExperienceHeadMarkupApp() {
  await buildGeneratedSalesforceApp('sf-experience-app', 'sf-experience-headmarkup-app', async (appPath) => {
    await modifyPackageJson(appPath, (packageJson) => {
      packageJson.name = 'sf-experience-headmarkup-app'
    })

    // This app exercises the Experience Cloud head markup init path, so it doesn't need the
    // static-resource-loaded init LWC used by sf-experience-app. Best-effort removal: if it's
    // not there, there's nothing to do.
    fs.rmSync(path.join(appPath, 'force-app/main/default/lwc/experienceDatadogInit'), {
      recursive: true,
      force: true,
    })
  })
}

async function buildGeneratedSalesforceApp(
  baseAppName: string,
  appName: string,
  modifyApp: (appPath: string) => Promise<void>
) {
  const baseAppPath = `test/apps/${baseAppName}`
  const appPath = `test/apps/${appName}`

  fs.rmSync(appPath, { recursive: true, force: true })
  fs.cpSync(baseAppPath, appPath, { recursive: true })

  await modifyApp(appPath)
  buildSalesforceApp(appName)
}

async function buildReactRouterV6App() {
  await buildGeneratedApp('react-router-app', 'react-router-v6-app', async (appPath) => {
    await modifyFile(path.join(appPath, 'package.json'), (content: string) =>
      content
        .replace(/"name": "react-router-app"/, '"name": "react-router-v6-app"')
        .replace(
          /"react-router": "[^"]*"/,
          `"react-router-dom": "${rumReactPackageJson.devDependencies['react-router-dom-6'].replace(/^npm:.*@/, '')}"`
        )
    )

    await modifyFile(path.join(appPath, 'app.tsx'), (content: string) =>
      content
        .replace('@datadog/browser-rum-react/react-router', '@datadog/browser-rum-react/react-router-v6')
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

async function buildReactRouterV7App() {
  await buildGeneratedApp('react-router-app', 'react-router-v7-app', async (appPath) => {
    await modifyFile(path.join(appPath, 'package.json'), (content: string) =>
      content
        .replace(/"name": "react-router-app"/, '"name": "react-router-v7-app"')
        .replace(
          /"react-router": "[^"]*"/,
          `"react-router": "${rumReactPackageJson.devDependencies['react-router-dom']}"`
        )
    )

    await modifyFile(path.join(appPath, 'app.tsx'), (content: string) =>
      content.replace('@datadog/browser-rum-react/react-router', '@datadog/browser-rum-react/react-router-v7')
    )

    await modifyFile(path.join(appPath, 'webpack.config.js'), (content: string) =>
      content
        .replace('react-router-app.js', 'react-router-v7-app.js')
        .replace('react-router-app.js', 'react-router-v7-app.js')
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

async function buildNextjsV13App() {
  await buildGeneratedApp('nextjs', 'nextjs-v13-app', async (appPath) => {
    // Drop the base app build output: it holds symlinks to node_modules packages, which `next build` empties when
    // cleaning it.
    fs.rmSync(path.join(appPath, '.next'), { recursive: true, force: true })

    // The `turbopack` option doesn't exist in Next.js 13. Build traces are only needed for standalone deployments, and
    // collecting them intermittently fails on Next.js 13 ("File .next/server/pages/....js does not exist").
    fs.writeFileSync(path.join(appPath, 'next.config.js'), 'module.exports = { outputFileTracing: false }\n')

    await modifyPackageJson(appPath, (packageJson) => {
      packageJson.name = 'nextjs-v13-app'
      packageJson.dependencies.next = aliasVersion(rumNextjsPackageJson.devDependencies['next-13'])
      packageJson.dependencies.react = aliasVersion(rumNextjsPackageJson.devDependencies['react-18'])
      packageJson.dependencies['react-dom'] = aliasVersion(rumNextjsPackageJson.devDependencies['react-dom-18'])
    })

    // Next.js < 15.3 doesn't support `instrumentation-client.js` (nor `onRouterTransitionStart`): init RUM from a
    // module imported by the root layout (App Router) and by `_app` (Pages Router) instead.
    fs.rmSync(path.join(appPath, 'instrumentation-client.js'))
    fs.writeFileSync(
      path.join(appPath, 'datadog-init.js'),
      `import { datadogRum } from '@datadog/browser-rum'
import { nextjsPlugin } from '@datadog/browser-rum-nextjs'

if (typeof window !== 'undefined') {
  const params = new URLSearchParams(window.location.search)
  const config = params.get('rum-config')
  const context = params.get('rum-context')

  if (config && !datadogRum.getInitConfiguration()) {
    datadogRum.init({ ...JSON.parse(config), plugins: [nextjsPlugin()] })
    if (context) {
      datadogRum.setGlobalContext(JSON.parse(context))
    }
  }
}
`
    )
    // Render DatadogAppRouter from the client module that inits RUM, so RUM is initialized before it renders.
    fs.writeFileSync(
      path.join(appPath, 'app/datadog-app-router.tsx'),
      `'use client'

import '../datadog-init'
import { DatadogAppRouter as BaseDatadogAppRouter } from '@datadog/browser-rum-nextjs'

export function DatadogAppRouter() {
  return <BaseDatadogAppRouter />
}
`
    )
    await modifyFile(path.join(appPath, 'app/layout.tsx'), (content: string) =>
      content.replace("from '@datadog/browser-rum-nextjs'", "from './datadog-app-router'")
    )
    await modifyFile(path.join(appPath, 'pages/_app.tsx'), (content: string) => `import '../datadog-init'\n${content}`)
  })
}

/**
 * Extract the version from a package alias, e.g. `npm:next@13.5.11` -> `13.5.11`
 */
function aliasVersion(alias: string) {
  return alias.replace(/^npm:.*@/, '')
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
