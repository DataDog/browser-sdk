import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'

test.describe('vital collection', () => {
  createTest('send custom duration vital')
    .withRum()
    .run(async ({ flushEvents, intakeRegistry, page }) => {
      await page.evaluate(() => {
        const vital = window.DD_RUM!.startDurationVital('foo')
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            window.DD_RUM!.stopDurationVital(vital)
            resolve()
          }, 5)
        })
      })
      await flushEvents()

      expect(intakeRegistry.rumVitalEvents.length).toBe(1)
      expect(intakeRegistry.rumVitalEvents[0].vital.name).toEqual('foo')
      expect(intakeRegistry.rumVitalEvents[0].vital.duration).toEqual(expect.any(Number))
    })
})
