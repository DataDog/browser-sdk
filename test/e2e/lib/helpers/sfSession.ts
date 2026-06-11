import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { DEFAULT_RUM_CONFIGURATION } from './configuration'

const orgAlias = process.env.SF_ORG_ALIAS ?? 'engrumdev'

function getSfSession() {
  if (process.env.SF_INSTANCE_URL && process.env.SF_ACCESS_TOKEN) {
    return {
      instanceUrl: process.env.SF_INSTANCE_URL,
      accessToken: process.env.SF_ACCESS_TOKEN,
    }
  }

  const { status, stdout, stderr } = spawnSync('sf', ['org', 'display', '-o', orgAlias, '--json'], {
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1' },
  })

  if (status !== 0) {
    throw new Error(
      `Could not get SF session for org '${orgAlias}'. Run 'sf org display -o ${orgAlias}' to diagnose.\n${stderr}`
    )
  }

  const result = JSON.parse(stdout).result
  if (!result?.instanceUrl || !result?.accessToken) {
    throw new Error(
      `Could not get SF session for org '${orgAlias}'. ` +
        'Set SF_INSTANCE_URL and SF_ACCESS_TOKEN for CI, or authenticate with the Salesforce CLI locally.'
    )
  }

  return {
    instanceUrl: result.instanceUrl as string,
    accessToken: result.accessToken as string,
  }
}

function getResourceName(): string {
  const filePath = resolve(__dirname, '../../../apps/sf-lwc-app/.sf-e2e/resource-name')
  if (existsSync(filePath)) {
    return readFileSync(filePath, 'utf-8').trim()
  }
  throw new Error('SF LWC resource name not found. Run yarn build:apps --app sf-lwc-app first.')
}

function buildSfLwcRetPath() {
  const homePath = '/lightning/app/c__SF_LWC_App/page/home'

  const path = new URL(homePath, 'https://salesforce.test')
  path.searchParams.set('c__datadogResourceName', getResourceName())
  path.searchParams.set(
    'c__datadogInitConfiguration',
    JSON.stringify({
      ...DEFAULT_RUM_CONFIGURATION,
      service: 'browser-sdk-salesforce-e2e',
      env: 'e2e',
    })
  )
  return `${path.pathname}${path.search}`
}

export function buildFrontdoorUrl(): string {
  const { instanceUrl, accessToken } = getSfSession()
  const base = instanceUrl.replace(/\/+$/, '')
  return `${base}/secur/frontdoor.jsp?sid=${accessToken}&retURL=${encodeURIComponent(buildSfLwcRetPath())}`
}
