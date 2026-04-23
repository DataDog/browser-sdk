import { execFileSync } from 'node:child_process'

let cachedTargets: SalesforceTargets | undefined

export interface SalesforceTargets {
  loginUrl: string
  experienceUrl: string
  experienceProductExplorerUrl: string
  lightningHomeUrl: string
  lightningProductExplorerUrl: string
}

// Uses `sf org open --url-only --json` to obtain an authenticated org URL.
// Reference: https://github.com/salesforcecli/plugin-org#sf-org-open
export function getSalesforceTargets() {
  if (cachedTargets) {
    return cachedTargets
  }

  const { NO_COLOR: _ignoredNoColor, ...environment } = process.env
  const stdout = execFileSync(
    'sf',
    ['org', 'open', '-o', 'ebikes', '--url-only', '--path', '/lightning/page/home', '--json'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...environment, FORCE_COLOR: '0', CLICOLOR: '0' },
    }
  )

  const result = JSON.parse(stripAnsi(stdout)) as { result?: { url?: string } }
  const loginUrl = result.result?.url

  if (!loginUrl) {
    throw new Error('sf org open did not return an authenticated URL.')
  }

  // Derive Lightning and Experience Cloud origins from the authenticated org URL.
  const loginOrigin = new URL(loginUrl).origin
  const lightningOrigin = loginOrigin.replace('.my.salesforce.com', '.lightning.force.com')
  const experienceOrigin = loginOrigin.replace('.my.salesforce.com', '.my.site.com')

  cachedTargets = {
    loginUrl,
    experienceUrl: `${experienceOrigin}/ebikes/s`,
    experienceProductExplorerUrl: `${experienceOrigin}/ebikes/s/product-explorer`,
    lightningHomeUrl: `${lightningOrigin}/lightning/page/home`,
    lightningProductExplorerUrl: `${lightningOrigin}/lightning/n/Product_Explorer`,
  }

  return cachedTargets
}

function stripAnsi(candidate: string) {
  return candidate.replace(/\u001b\[[0-9;]*m/g, '')
}
