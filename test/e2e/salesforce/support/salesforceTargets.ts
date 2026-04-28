import { execFileSync } from 'node:child_process'

let cachedTargets: SalesforceTargets | undefined
let cachedDreamhouseAuraTargets: DreamhouseAuraSalesforceTargets | undefined
const ANSI_ESCAPE_SEQUENCE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

export interface SalesforceTargets {
  loginUrl: string
  experienceUrl: string
  experienceProductExplorerUrl: string
  lightningHomeUrl: string
  lightningProductExplorerUrl: string
}

export interface DreamhouseAuraSalesforceTargets {
  loginUrl: string
  lightningPropertyFinderUrl: string
  lightningPropertyExplorerUrl: string
}

// Uses `sf org open --url-only --json` to obtain an authenticated org URL.
// Reference: https://github.com/salesforcecli/plugin-org#sf-org-open
export function getSalesforceTargets() {
  if (cachedTargets) {
    return cachedTargets
  }

  const loginUrl = getAuthenticatedOrgUrl('ebikes', '/lightning/page/home')

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

export function getDreamhouseAuraSalesforceTargets() {
  if (cachedDreamhouseAuraTargets) {
    return cachedDreamhouseAuraTargets
  }

  const loginUrl = getAuthenticatedOrgUrl('dreamhouse-aura', '/lightning/n/Property_Finder')
  const loginOrigin = new URL(loginUrl).origin
  const lightningOrigin = loginOrigin.replace('.my.salesforce.com', '.lightning.force.com')

  cachedDreamhouseAuraTargets = {
    loginUrl,
    lightningPropertyFinderUrl: `${lightningOrigin}/lightning/n/Property_Finder`,
    lightningPropertyExplorerUrl: `${lightningOrigin}/lightning/n/Property_Explorer`,
  }

  return cachedDreamhouseAuraTargets
}

function getAuthenticatedOrgUrl(orgAlias: string, path: string) {
  const environment = { ...process.env }
  delete environment.NO_COLOR
  const stdout = execFileSync('sf', ['org', 'open', '-o', orgAlias, '--url-only', '--path', path, '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...environment, FORCE_COLOR: '0', CLICOLOR: '0' },
  })

  const result = JSON.parse(stripAnsi(stdout)) as { result?: { url?: string } }
  const loginUrl = result.result?.url

  if (!loginUrl) {
    throw new Error(`sf org open did not return an authenticated URL for ${orgAlias}.`)
  }

  return loginUrl
}

function stripAnsi(candidate: string) {
  return candidate.replace(ANSI_ESCAPE_SEQUENCE, '')
}
