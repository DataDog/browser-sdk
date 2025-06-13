import { test, expect } from '@playwright/test'
import { type RumPlugin } from '@datadog/browser-rum-core'
import { clocksNow, generateUUID } from '@datadog/browser-core'
import type { PartialRumEvent } from '@datadog/browser-rum-core/cjs/domain/event/eventCollection'
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

const mockPartiaEvents: PartialRumEvent[] = [
  {
    type: 'action',
    date: 1,
    action: {
      id: generateUUID(),
      type: 'click',
      name: 'click on button',
    },
  },
  {
    type: 'error',
    date: 1,
    error: {
      id: generateUUID(),
      message: 'test error',
      source: 'source',
    },
  },
  {
    type: 'long_task',
    date: 1,
    long_task: {
      id: generateUUID(),
      name: 'long task',
      duration: 100,
    },
  },
  {
    type: 'resource',
    date: 1,
    resource: {
      id: generateUUID(),
      type: 'document',
      url: 'https://www.datadoghq.com',
      method: 'GET',
      status: 200,
      duration: 100,
      size: 100,
    },
  },
  {
    type: 'vital',
    date: 1,
    vital: {
      id: generateUUID(),
      type: 'duration',
      name: 'vital',
      duration: 100,
      description: 'vital',
    },
  },
] as const

test.describe('onRumStart @only', () => {
  for (const partialEvent of mockPartiaEvents) {
    createTest(`addEvent can send ${partialEvent.type} events`)
      .withRum({ plugins: [createPlugin()] })
      .run(async ({ flushEvents, intakeRegistry, page }) => {
        const startClocks = clocksNow()
        const eventType = partialEvent.type

        await page.evaluate(
          ({ startClocks, event }) => {
            window.TEST_PLUGIN.addEvent(startClocks.relative, event, {})
          },
          { startClocks, event: partialEvent }
        )
        await flushEvents()
        const event = intakeRegistry.rumEvents.filter(
          (e) => e.type === partialEvent.type && (e as any)[eventType]?.id === (partialEvent as any)[eventType].id
        )
        console.log('event', event)

        expect(event.length).toBeGreaterThan(0)
        expect((event[0] as any)[eventType].id).toBe((partialEvent as any)[eventType].id)
      })
  }

  createTest('addEvent cannot send view events')
    .withRum({ plugins: [createPlugin()] })
    .run(async ({ flushEvents, intakeRegistry, page }) => {
      const startClocks = clocksNow()
      const uuid = generateUUID()

      await page.evaluate(
        ({ startClocks, uuid }) => {
          window.TEST_PLUGIN.addEvent(
            startClocks.relative,
            {
              type: 'view',
              date: startClocks.timeStamp,
              view: {
                id: uuid,
                name: 'TrackedPage',
              },
            } as unknown as PartialRumEvent,
            {}
          )
        },
        { startClocks, uuid }
      )
      await flushEvents()

      const viewEvents = intakeRegistry.rumViewEvents

      expect(viewEvents.some((v) => v.view.id === uuid)).toBe(false)
    })
})
