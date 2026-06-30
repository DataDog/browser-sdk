import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const repositoryRoot = resolve(__dirname, '../../../..')

export const salesforceLwcBundlePath = resolve(
  repositoryRoot,
  'test/apps/sf-lwc-app/force-app/main/default/staticresources/datadog_rum_slim.js'
)

export function getSalesforceConfig(): { targetOrg: string; isConfigured: boolean } {
  const targetOrg = process.env.SF_TARGET_ORG ?? 'sf-lwc-ci'
  const isConfigured =
    spawnSync('sf', ['org', 'display', '--target-org', targetOrg], {
      encoding: 'utf8',
      cwd: repositoryRoot,
    }).status === 0
  return { targetOrg, isConfigured }
}

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
