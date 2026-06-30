import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const repositoryRoot = resolve(__dirname, '../../../..')

export const salesforceLwcBundlePath = resolve(
  repositoryRoot,
  'test/apps/sf-lwc-app/force-app/main/default/staticresources/datadog_rum_slim.js'
)

// Check if the Salesforce org is configured
export function getSalesforceConfig(): { targetOrg: string; isConfigured: boolean } {
  const targetOrg = process.env.SF_TARGET_ORG ?? 'sf-lwc-ci'
  const args = ['org', 'display', '--target-org', targetOrg]
  const options = { encoding: 'utf8' as const, cwd: repositoryRoot }

  const result = spawnSync('sf', args, options)
  if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') {
    return { targetOrg, isConfigured: false }
  }

  return { targetOrg, isConfigured: result.status === 0 }
}

// Build the URL to open in the test browser
export function buildSalesforceLwcUrl(proxy: string): string {
  const result = spawnSync('node', ['scripts/salesforce-lwc-app.ts', 'open-url'], {
    encoding: 'utf8',
    cwd: repositoryRoot,
    env: { ...process.env, DD_SALESFORCE_E2E_PROXY: proxy },
  })

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout)
  }

  return result.stdout.trim()
}
