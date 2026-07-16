import type { RemoteConfiguration } from '@datadog/browser-core'
import { test, expect } from '@playwright/test'
import { createTest, html } from '../../lib/framework'

const RC_ID = 'e2e'
const CACHE_KEY = `dd_rc_${RC_ID}`

test.describe('logs remote configuration', () => {
  createTest('should apply forwardErrorsToLogs: false from cached remote configuration')
    .withLogs({ remoteConfigurationId: RC_ID })
    .withHead(
      seedCache({ logs: { forwardErrorsToLogs: false } })
    )
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        console.error('test error')
      })

      await flushEvents()

      expect(intakeRegistry.logsEvents.filter((e) => e.message === 'test error')).toHaveLength(0)
    })
})

function seedCache(remoteConfig: RemoteConfiguration) {
  const entry = JSON.stringify({ version: 2, config: remoteConfig, fetchedAt: 1000 })
  return html`<script>
    localStorage.setItem('${CACHE_KEY}', ${JSON.stringify(entry)})
  </script>`
}
