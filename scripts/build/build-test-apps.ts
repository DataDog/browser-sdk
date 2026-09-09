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
  { name: 'sf-lwc-app-sr', builderFn: buildSalesforceSessionReplayApp, deps: ['sf-lwc-app'] },
  { name: 'sf-experience-app', builderFn: buildSalesforceApp },
  {
    name: 'sf-experience-headmarkup-app',
    builderFn: buildExperienceHeadMarkupApp,
    deps: ['sf-experience-app'],
  },
  {
    name: 'sf-experience-headmarkup-sr',
    builderFn: buildExperienceHeadMarkupSessionReplayApp,
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
  const sourceBundle = 'packages/browser-rum-slim/bundle/datadog-rum-salesforce.js'
  const targetBundle = `test/apps/${appName}/force-app/main/default/staticresources/datadog_rum_salesforce.js`

  printLog(`Building app at test/apps/${appName}...`)
  fs.copyFileSync(sourceBundle, targetBundle)
}

async function buildSalesforceSessionReplayApp() {
  await buildGeneratedSalesforceApp('sf-lwc-app', 'sf-lwc-app-sr', async (appPath) => {
    await modifyFile(path.join(appPath, 'package.json'), (content: string) =>
      content.replace('"name": "sf-lwc-app"', '"name": "sf-lwc-app-sr"')
    )
    await modifyFile(
      path.join(appPath, 'force-app/main/default/applications/SF_LWC_App.app-meta.xml'),
      (content: string) =>
        content
          .replace('<label>SF LWC App</label>', '<label>SF LWC App SR</label>')
          .replace(
            '<utilityBar>SF_LWC_App_UtilityBar</utilityBar>',
            '<utilityBar>SF_LWC_App_SR_UtilityBar</utilityBar>'
          )
    )
    fs.renameSync(
      path.join(appPath, 'force-app/main/default/applications/SF_LWC_App.app-meta.xml'),
      path.join(appPath, 'force-app/main/default/applications/SF_LWC_App_SR.app-meta.xml')
    )
    await modifyFile(
      path.join(appPath, 'force-app/main/default/flexipages/SF_LWC_App_UtilityBar.flexipage-meta.xml'),
      (content: string) =>
        content
          .replaceAll('SF LWC App', 'SF LWC App SR')
          .replaceAll('datadogInit', 'datadogInitSr')
          .replace(
            '</componentInstanceProperties>\n                <componentInstanceProperties>\n                    <name>label</name>',
            `</componentInstanceProperties>
                <componentInstanceProperties>
                    <name>applicationId</name>
                    <value>a08fb90d-3a11-4391-9ed3-1cb2ec7703ed</value>
                </componentInstanceProperties>
                <componentInstanceProperties>
                    <name>clientToken</name>
                    <value>pub2170234a8cda07e021cff9912de6e048</value>
                </componentInstanceProperties>
                <componentInstanceProperties>
                    <name>site</name>
                    <value>datad0g.com</value>
                </componentInstanceProperties>
                <componentInstanceProperties>
                    <name>service</name>
                    <value>SERVICE_NAME</value>
                </componentInstanceProperties>
                <componentInstanceProperties>
                    <name>env</name>
                    <value>ENV_NAME</value>
                </componentInstanceProperties>
                <componentInstanceProperties>
                    <name>label</name>`
          )
          .replace('<value>Datadog Init</value>', '<value>Datadog Init SR</value>')
    )
    fs.renameSync(
      path.join(appPath, 'force-app/main/default/flexipages/SF_LWC_App_UtilityBar.flexipage-meta.xml'),
      path.join(appPath, 'force-app/main/default/flexipages/SF_LWC_App_SR_UtilityBar.flexipage-meta.xml')
    )
    fs.renameSync(
      path.join(appPath, 'force-app/main/default/lwc/datadogInit'),
      path.join(appPath, 'force-app/main/default/lwc/datadogInitSr')
    )
    for (const extension of ['html', 'js', 'js-meta.xml']) {
      fs.renameSync(
        path.join(appPath, `force-app/main/default/lwc/datadogInitSr/datadogInit.${extension}`),
        path.join(appPath, `force-app/main/default/lwc/datadogInitSr/datadogInitSr.${extension}`)
      )
    }
    await modifyFile(
      path.join(appPath, 'force-app/main/default/lwc/datadogInitSr/datadogInitSr.js'),
      (content: string) =>
        content
          .replace("import { LightningElement, wire } from 'lwc'", "import { LightningElement, wire, api } from 'lwc'")
          .replace(
            `const defaultInitConfiguration = {
  applicationId: 'xxx',
  clientToken: 'xxx',
  site: 'datadoghq.com',
  trackViewsManually: true,
}

`,
            ''
          )
          .replace(
            'export default class DatadogInit extends NavigationMixin(LightningElement) {',
            `export default class DatadogInit extends NavigationMixin(LightningElement) {
  @api applicationId
  @api clientToken
  @api site
  @api service
  @api env
`
          )
          .replace(
            'window.DD_RUM.init({ ...defaultInitConfiguration, ...window.RUM_CONFIGURATION })',
            `window.DD_RUM.init({
        applicationId: this.applicationId,
        clientToken: this.clientToken,
        site: this.site,
        service: this.service,
        env: this.env,
        sessionSampleRate: 100,
        sessionReplaySampleRate: 100,
        trackViewsManually: true,
        ...window.RUM_CONFIGURATION,
      })`
          )
          .replace(
            'window.DD_RUM.setGlobalContext(window.RUM_CONTEXT)',
            `if (window.RUM_CONTEXT) {
        window.DD_RUM.setGlobalContext(window.RUM_CONTEXT)
      }`
          )
          .replaceAll('datadog_rum_salesforce', 'datadog_rum_salesforce_sr')
    )
    await modifyFile(
      path.join(appPath, 'force-app/main/default/lwc/datadogInitSr/datadogInitSr.js-meta.xml'),
      (content: string) =>
        content.replace(
          '</LightningComponentBundle>',
          `    <targetConfigs>
        <targetConfig targets="lightning__UtilityBar">
            <property name="applicationId" type="String"/>
            <property name="clientToken" type="String"/>
            <property name="site" type="String"/>
            <property name="service" type="String"/>
            <property name="env" type="String"/>
        </targetConfig>
    </targetConfigs>
</LightningComponentBundle>`
        )
    )
    await modifyFile(
      path.join(appPath, 'force-app/main/default/permissionsets/SF_LWC_App.permissionset-meta.xml'),
      (content: string) => content.replaceAll('SF_LWC_App', 'SF_LWC_App_SR').replaceAll('SF LWC App', 'SF LWC App SR')
    )
    fs.renameSync(
      path.join(appPath, 'force-app/main/default/permissionsets/SF_LWC_App.permissionset-meta.xml'),
      path.join(appPath, 'force-app/main/default/permissionsets/SF_LWC_App_SR.permissionset-meta.xml')
    )
    fs.renameSync(
      path.join(appPath, 'force-app/main/default/staticresources/datadog_rum_salesforce.resource-meta.xml'),
      path.join(appPath, 'force-app/main/default/staticresources/datadog_rum_salesforce_sr.resource-meta.xml')
    )
    await modifyFile(path.join(appPath, '.gitignore'), (content: string) =>
      content.replace('datadog_rum_salesforce.js', 'datadog_rum_salesforce_sr.js')
    )
    fs.copyFileSync(
      'packages/browser-rum/bundle/datadog-rum-salesforce-sr.js',
      path.join(appPath, 'force-app/main/default/staticresources/datadog_rum_salesforce_sr.js')
    )
  })
}

async function buildExperienceHeadMarkupApp() {
  await buildExperienceHeadMarkupVariant('sf-experience-headmarkup-app')
}

async function buildExperienceHeadMarkupSessionReplayApp() {
  await buildExperienceHeadMarkupVariant('sf-experience-headmarkup-sr')
  fs.rmSync('test/apps/sf-experience-headmarkup-sr/force-app/main/default/staticresources', {
    recursive: true,
    force: true,
  })
}

async function buildExperienceHeadMarkupVariant(appName: string) {
  await buildGeneratedSalesforceApp('sf-experience-app', appName, async (appPath) => {
    await modifyPackageJson(appPath, (packageJson) => {
      packageJson.name = appName
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
        .replace(/"react-router": "[^"]*"/, '"react-router-dom": "6.30.0"')
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
        .replace(/"react-router": "[^"]*"/, '"react-router": "7.18.1"')
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
