import { test, expect } from '@playwright/test'
import { ExperimentalFeature } from '@datadog/browser-core'
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
    .withRum({
      enableExperimentalFeatures: [ExperimentalFeature.FEATURE_OPERATION_VITAL],
    })
    .run(async ({ flushEvents, intakeRegistry, page }) => {
      await page.evaluate(() => {
        window.DD_RUM!.startFeatureOperation('foo')
      })
      await flushEvents()

      expect(intakeRegistry.rumVitalEvents).toHaveLength(1)
      expect(intakeRegistry.rumVitalEvents[0].vital.name).toEqual('foo')
      expect(intakeRegistry.rumVitalEvents[0].vital.step_type).toEqual('start')
    })
})
