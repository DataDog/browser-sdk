import { test, expect } from '@playwright/test'
import { type RumPlugin } from '@datadog/browser-rum-core'
import { clocksNow, generateUUID } from '@datadog/browser-core'
import { createTest } from '../lib/framework'

declare global {
  interface Window {
    TEST_PLUGIN: Parameters<NonNullable<RumPlugin['onRumStart']>>[0]
  }
}

function createPlugin(): RumPlugin {
  return {
    name: 'test-plugin',
    onRumStart: ({ addEvent }) => {
      window.TEST_PLUGIN = { addEvent }
    },
  }
}

test.describe('onRumStart', () => {
  createTest('addEvent can send action events')
    .withRum({ plugins: [createPlugin()] })
    .run(async ({ flushEvents, intakeRegistry, page }) => {
      const startClocks = clocksNow()
      const uuid = generateUUID()

      await page.evaluate(
        ({ startClocks, uuid }) => {
          window.TEST_PLUGIN.addEvent(
            startClocks.relative,
            {
              type: 'action',
              date: startClocks.timeStamp,
              action: {
                id: uuid,
                name: 'TrackedPage',
                type: 'click',
                target: {
                  name: 'TrackedPage',
                },
              },
            },
            {}
          )
        },
        { startClocks, uuid }
      )
      await flushEvents()

      const actionEvents = intakeRegistry.rumActionEvents

      expect(actionEvents.length).toBeGreaterThan(0)
      expect(actionEvents[0].action.id).toBe(uuid)
    })
})
