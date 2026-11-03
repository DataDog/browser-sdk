import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'

test.describe('vital collection', () => {
  createTest('send custom duration vital')
    .withRum()
    .run(async ({ flushEvents, intakeRegistry, page }) => {
      await page.evaluate(() => {
        window.DD_RUM!.startDurationVital('foo')
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            window.DD_RUM!.stopDurationVital('foo')
            resolve()
          }, 5)
        })
      })
      await flushEvents()

      expect(intakeRegistry.rumVitalEvents).toHaveLength(1)
      expect(intakeRegistry.rumVitalEvents[0].vital.name).toEqual('foo')
      expect(intakeRegistry.rumVitalEvents[0].vital.duration).toEqual(expect.any(Number))
    })

  createTest('send two simultaneous duration vitals using vitalKey')
    .withRum()
    .run(async ({ flushEvents, intakeRegistry, page }) => {
      await page.evaluate(() => {
        const key1 = 'key-1'
        const key2 = 'key-2'
        window.DD_RUM!.startDurationVital('foo', { vitalKey: key1 })
        window.DD_RUM!.startDurationVital('foo', { vitalKey: key2 })
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            window.DD_RUM!.stopDurationVital('foo', { vitalKey: key1 })
            window.DD_RUM!.stopDurationVital('foo', { vitalKey: key2 })
            resolve()
          }, 5)
        })
      })
      await flushEvents()

      expect(intakeRegistry.rumVitalEvents).toHaveLength(2)
      expect(intakeRegistry.rumVitalEvents[0].vital.name).toEqual('foo')
      expect(intakeRegistry.rumVitalEvents[1].vital.name).toEqual('foo')
    })

  createTest('send operation step vital')
    .withRum()
    .run(async ({ flushEvents, intakeRegistry, page }) => {
      await page.evaluate(() => {
        window.DD_RUM!.startOperation('foo')
      })
      await flushEvents()

      expect(intakeRegistry.rumVitalEvents).toHaveLength(1)
      expect(intakeRegistry.rumVitalEvents[0].vital.name).toEqual('foo')
      expect(intakeRegistry.rumVitalEvents[0].vital.step_type).toEqual('start')
    })

  createTest('send an abandoned end step for an opted-in operation still open when the page terminates')
    .withRum({ enableExperimentalFeatures: ['abandon_operations_on_page_exit'] })
    .run(async ({ flushEvents, intakeRegistry, page }) => {
      await page.evaluate(() => {
        window.DD_RUM!.startOperation('open', { operationKey: 'key', abandonOnPageExit: true })
        window.DD_RUM!.startOperation('cross')
        window.DD_RUM!.startOperation('done', { abandonOnPageExit: true })
        window.DD_RUM!.succeedOperation('done')
      })
      // A reload never keeps the page in the back/forward cache, so it always terminates the page.
      // Navigating away (as flushEvents does) can keep it cached, which correctly abandons nothing.
      await page.reload()
      await flushEvents()

      const endSteps = intakeRegistry.rumVitalEvents
        .filter(({ vital }) => vital.step_type === 'end')
        .map(({ vital }) => ({
          name: vital.name,
          operationKey: vital.operation_key,
          failureReason: vital.failure_reason,
        }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))

      expect(endSteps).toEqual([
        { name: 'done', operationKey: undefined, failureReason: undefined },
        { name: 'open', operationKey: 'key', failureReason: 'abandoned' },
      ])
    })
})
