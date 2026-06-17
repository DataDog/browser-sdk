import { test, expect } from '@playwright/test'
import { createTest } from '../lib/framework'
import type { BrowserConfiguration } from '../../browsers.conf'

// Network Efficiency Guardrails is a Document Policy feature currently only available in Edge 146+
// and in Chromium behind the "Experimental Web Platform features" flag.
// We run these tests only on Chromium.

test.describe('network efficiency guardrails', () => {
  test.beforeEach(({ browserName }) => {
    const { version } = test.info().project.metadata as BrowserConfiguration
    // Network Efficiency Guardrails requires Chromium 146+. Pinned projects set an explicit
    // version; current (unversioned) Chromium is always new enough.
    test.skip(
      browserName !== 'chromium' || (version !== undefined && Number(version) < 146),
      'Network Efficiency Guardrails requires Chromium 146+'
    )
  })

  test.describe('RUM', () => {
    createTest('should collect network-efficiency-guardrails violations as RUM errors')
      .withRum()
      .withBasePath('/?network-efficiency-guardrails=true')
      .run(async ({ page, intakeRegistry, flushEvents, withBrowserLogs }) => {
        // Trigger a violation after the SDK has initialized: fetch an uncompressed JS resource.
        // The Document-Policy header on the page opts into monitoring, and the lack of
        // Content-Encoding on this endpoint triggers a "resource compression" violation.
        await page.evaluate(() => fetch('/uncompressed-script.js'))

        await flushEvents()

        const guardrailErrors = intakeRegistry.rumErrorEvents.filter((event) =>
          event.error.message.startsWith('document-policy-violation:')
        )

        // The SDK bundles themselves (served uncompressed in dev) also trigger violations,
        // so we may receive more than one. Assert we got at least one for our resource.
        expect(guardrailErrors.length).toBeGreaterThanOrEqual(1)

        const error = guardrailErrors[0].error
        expect(error.source).toBe('report')
        expect(error.handling).toBe('unhandled')
        expect(error.csp?.disposition).toMatch(/enforce|report/)

        // The browser logs a console error for each violation — acknowledge them so the
        // framework teardown check doesn't fail.
        withBrowserLogs((logs) => {
          const errors = logs.filter((log) => log.level === 'error')
          expect(errors.length).toBeGreaterThanOrEqual(1)
          expect(errors[0].message).toContain('Document policy violation: resource compression is required')
        })
      })
  })

  test.describe('Logs', () => {
    createTest('should forward network-efficiency-guardrails violations via forwardReports')
      .withLogs({ forwardReports: ['network-efficiency-guardrails'] })
      .withBasePath('/?network-efficiency-guardrails=true')
      .run(async ({ page, intakeRegistry, flushEvents, withBrowserLogs }) => {
        await page.evaluate(() => fetch('/uncompressed-script.js'))

        await flushEvents()

        const guardrailLogs = intakeRegistry.logsEvents.filter((event) =>
          event.message.startsWith('document-policy-violation:')
        )

        expect(guardrailLogs).toHaveLength(1)
        expect(guardrailLogs[0].origin).toBe('report')
        expect(guardrailLogs[0].status).toBe('error')

        withBrowserLogs((logs) => {
          expect(logs.filter((log) => log.level === 'error')).toHaveLength(1)
          expect(logs[0].message).toContain('Document policy violation: resource compression is required')
        })
      })

    createTest('should not forward network-efficiency-guardrails violations when not in forwardReports')
      .withLogs({ forwardReports: [] })
      .withBasePath('/?network-efficiency-guardrails=true')
      .run(async ({ page, intakeRegistry, flushEvents, withBrowserLogs }) => {
        await page.evaluate(() => fetch('/uncompressed-script.js'))

        await flushEvents()

        const guardrailLogs = intakeRegistry.logsEvents.filter((event) =>
          event.message.startsWith('document-policy-violation:')
        )

        expect(guardrailLogs).toHaveLength(0)

        withBrowserLogs((logs) => {
          expect(logs.filter((log) => log.level === 'error')).toHaveLength(1)
          expect(logs[0].message).toContain('Document policy violation: resource compression is required')
        })
      })
  })
})
