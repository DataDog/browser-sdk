import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const repositoryRoot = resolve(__dirname, '../../../..')

export const salesforceLwcBundlePath = resolve(
  repositoryRoot,
  'test/apps/sf-lwc-app/force-app/main/default/staticresources/datadog_rum_slim.js'
)

export function buildSalesforceLwcUrl(): string {
  const result = spawnSync('node', ['scripts/salesforce-lwc-app.ts', 'open-url'], {
    encoding: 'utf8',
    cwd: repositoryRoot,
  })

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout)
  }

  return result.stdout.trim()
}
