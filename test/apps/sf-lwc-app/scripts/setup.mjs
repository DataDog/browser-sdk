import { copyFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2).filter((arg) => arg !== '--')
const orgArgs = getOrgArgs(args)
const homePath = '/lightning/page/home'
const homeWithRumPath =
  `${homePath}?c__applicationId=1397744d-34f4-4a6a-a735-801e31c18221` +
  '&c__clientToken=pub2ad3fe2578f01b9f329bd0ea4a2f08c5' +
  '&c__env=dev' +
  '&c__service=browser-sdk-sandbox' +
  '&c__site=datadoghq.com'

syncDatadogBundle()
run('sf', ['project', 'deploy', 'start', ...args])
assignPermissionSet()
printAppUrl()

// Copies the Datadog RUM slim bundle to the app's staticresource
function syncDatadogBundle() {
  const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const browserSdkDir = resolve(appDir, '..', '..', '..')
  const sourceBundle = resolve(browserSdkDir, 'packages/browser-rum-slim/bundle/datadog-rum-slim.js')
  const targetBundle = resolve(appDir, 'force-app/main/default/staticresources/datadog_rum_slim.js')

  if (!existsSync(sourceBundle)) {
    throw new Error(
      `Missing Datadog RUM slim bundle at ${sourceBundle}. Run from a browser-sdk checkout with the bundle built.`
    )
  }

  copyFileSync(sourceBundle, targetBundle)
  console.log(`Synced ${targetBundle}`)
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function assignPermissionSet() {
  const result = spawnSync('sf', ['org', 'assign', 'permset', '-n', 'SF_LWC_App', ...orgArgs], {
    encoding: 'utf8',
  })

  if (result.status === 0) {
    console.log('Assigned SF_LWC_App permission set')
    return
  }

  const output = `${result.stdout}\n${result.stderr}`
  if (output.includes('Duplicate PermissionSetAssignment')) {
    console.log('SF_LWC_App permission set already assigned')
    return
  }

  process.stdout.write(result.stdout)
  process.stderr.write(result.stderr)
  process.exit(result.status ?? 1)
}

function printAppUrl() {
  const result = spawnSync(
    'sf',
    ['org', 'open', '-p', '/lightning/app/c__SF_LWC_App/page/home', '--url-only', '--json', ...orgArgs],
    {
      encoding: 'utf8',
    }
  )

  if (result.status !== 0) {
    process.stderr.write(result.stderr)
    process.exit(result.status ?? 1)
  }

  const { result: openResult } = JSON.parse(result.stdout)
  const lightningUrl = new URL(openResult.url).origin.replace('.my.salesforce.com', '.lightning.force.com')

  console.log(`Home: ${openResult.url}`)
  console.log(`Home with RUM: ${lightningUrl}${homeWithRumPath}`)
}

function getOrgArgs(args) {
  const orgArgs = []

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if ((arg === '-o' || arg === '--target-org') && args[index + 1]) {
      orgArgs.push(arg, args[index + 1])
      index += 1
    } else if (arg.startsWith('--target-org=')) {
      orgArgs.push(arg)
    }
  }

  return orgArgs
}
