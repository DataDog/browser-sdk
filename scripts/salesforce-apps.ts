import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { parseArgs } from 'node:util'

import { printLog, runMain } from './lib/executionUtils.ts'
import { getSfLwcClientId, getSfLwcInstanceUrl, getSfLwcJwtPrivateKey, getSfLwcUsername } from './lib/secrets.ts'
import { command } from './lib/command.ts'

const repositoryRoot = resolve(import.meta.dirname, '..')
const TARGET_ORG = 'sf-lwc-ci'

type AppKey = 'lwc' | 'experience-cloud'

const APP_KEYS: AppKey[] = ['lwc', 'experience-cloud']

const APPS: Record<AppKey, { dir: string; url: string; buildBundle: boolean; siteName?: string }> = {
  lwc: {
    dir: resolve(repositoryRoot, 'test/apps/sf-lwc-app'),
    url: new URL('/lightning/app/c__SF_LWC_App/page/home', getSfLwcInstanceUrl()).href,
    buildBundle: true,
  },
  'experience-cloud': {
    dir: resolve(repositoryRoot, 'test/apps/sf-experience-app'),
    url: new URL('sfexperiencecloud/', getSalesforceSiteUrl()).href,
    buildBundle: false,
    siteName: 'SF Experience Cloud App',
  },
}

const SUPPORTED_COMMANDS = ['deploy-apps', 'get-urls']

runMain(() => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: {
        type: 'boolean',
        short: 'h',
      },
      app: {
        type: 'string',
      },
    },
  })

  if (values.help) {
    showUsageAndExit()
  }

  if (positionals.length !== 1) {
    throw new Error(
      `Usage: node scripts/salesforce-apps.ts <${SUPPORTED_COMMANDS.join('|')}> [--app ${APP_KEYS.join('|')}]`
    )
  }

  const commandName = positionals[0]
  const appKeys = resolveAppKeys(values.app)

  switch (commandName) {
    case 'deploy-apps':
      deployApp(appKeys)
      break
    case 'get-urls':
      printUrl(appKeys)
      break
    default:
      throw new Error(`Unknown command "${commandName ?? ''}". Expected: ${SUPPORTED_COMMANDS.join('|')}`)
  }
})

function showUsageAndExit() {
  console.log(`Usage: node scripts/salesforce-apps.ts <command> [--app ${APP_KEYS.join('|')}]`)
  console.log('')
  console.log('Commands:')
  console.log('  deploy-apps  Deploy the app(s) to the Salesforce org. To be done only when an app is updated.')
  console.log('  get-urls     Get the authenticated URL of the app(s).')
  process.exit(0)
}

function resolveAppKeys(appFlag: string | undefined): AppKey[] {
  if (!appFlag) {
    return APP_KEYS
  }
  if (!APP_KEYS.includes(appFlag as AppKey)) {
    throw new Error(`Unknown --app "${appFlag}". Expected one of: ${APP_KEYS.join('|')}`)
  }
  return [appFlag as AppKey]
}

function authenticate(targetOrg: string, cwd: string) {
  // Temporary directory holding the JWT private key for the duration of authentication.
  // Using a unique temp dir avoids collisions when multiple CI jobs run in parallel.
  const keyDirectory = mkdtempSync(resolve(tmpdir(), 'sf-lwc-jwt-'))
  const serverKeyPath = resolve(keyDirectory, 'server.key')

  try {
    writeFileSync(serverKeyPath, Buffer.from(getSfLwcJwtPrivateKey(), 'base64').toString('utf8'), { mode: 0o600 })

    printLog(`Authenticating Salesforce CLI alias ${targetOrg}...`)
    command`sf org login jwt --client-id ${getSfLwcClientId()} --jwt-key-file ${serverKeyPath} --username ${getSfLwcUsername()} --instance-url ${getSfLwcInstanceUrl()} --alias ${targetOrg}`
      .withCurrentWorkingDirectory(cwd)
      .withLogs()
      .run()
    printLog(`Salesforce CLI authenticated as ${targetOrg}.`)
  } finally {
    rmSync(keyDirectory, { recursive: true, force: true })
  }
}

function deployApp(appKeys: AppKey[]) {
  for (const appKey of appKeys) {
    const { dir, buildBundle, siteName } = APPS[appKey]

    if (buildBundle) {
      printLog('Building RUM slim bundle...')
      command`yarn workspace @datadog/browser-rum-slim build:bundle`.withLogs().run()
    }

    authenticate(TARGET_ORG, dir)
    rmSync(resolve(dir, '.sf'), { recursive: true, force: true })

    printLog(`Deploying Salesforce ${appKey} app to ${TARGET_ORG}...`)
    command`sf project deploy start --target-org ${TARGET_ORG} --source-dir force-app --ignore-conflicts --concise`
      .withCurrentWorkingDirectory(dir)
      .withLogs()
      .run()
    printLog(`Salesforce ${appKey} app deployed.`)

    if (siteName) {
      // Metadata deploys only update the site's draft version; publishing is a separate step
      // required to make the changes live on an Experience Builder / LWR site.
      printLog(`Publishing Salesforce site "${siteName}"...`)
      command`sf community publish --name ${siteName} --target-org ${TARGET_ORG}`
        .withCurrentWorkingDirectory(dir)
        .withLogs()
        .run()
      printLog(`Salesforce site "${siteName}" published.`)
    }
  }
}

function printUrl(appKeys: AppKey[]): void {
  for (const appKey of appKeys) {
    const { url } = APPS[appKey]
    console.log(url)
  }
}

function getSalesforceSiteUrl(): string {
  return getSfLwcInstanceUrl().replace('.my.salesforce.com', '.my.site.com')
}
