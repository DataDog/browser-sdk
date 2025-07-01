import { test, expect } from '@playwright/test'
import type { RumPlugin, AllowedRawRumEvent } from '@datadog/browser-rum-core'
import { ActionType, RumEventType } from '@datadog/browser-rum-core'
import type { ServerDuration, TimeStamp } from '@datadog/browser-core'
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

const mockPartialEvents: AllowedRawRumEvent[] = [
  {
    type: RumEventType.ACTION,
    date: 1 as TimeStamp,
    action: {
      id: generateUUID(),
      type: ActionType.CLICK,
      target: {
        name: 'click on button',
      },
    },
  },
  {
    type: RumEventType.ERROR,
    date: 1 as TimeStamp,
    error: {
      id: generateUUID(),
      message: 'test error',
      source: 'source',
      source_type: 'browser',
    },
  },
  {
    type: RumEventType.LONG_TASK,
    date: 1 as TimeStamp,
    long_task: {
      id: generateUUID(),
      entry_type: 'long-task',
      duration: 100 as ServerDuration,
    },
    _dd: {
      discarded: false,
    },
  },
  {
    type: RumEventType.RESOURCE,
    date: 1 as TimeStamp,
    resource: {
      id: generateUUID(),
      type: 'document',
      url: 'https://www.datadoghq.com',
      method: 'GET',
      status_code: 200,
      duration: 100 as ServerDuration,
      size: 100,
    },
    _dd: {
      discarded: false,
    },
  },
  {
    type: RumEventType.VITAL,
    date: 1 as TimeStamp,
    vital: {
      id: generateUUID(),
      type: 'duration',
      name: 'vital',
      duration: 100,
      description: 'vital',
    },
  },
] as const

test.describe('onRumStart', () => {
  for (const partialEvent of mockPartialEvents) {
    createTest(`addEvent can send ${partialEvent.type} events`)
      .withRum({ plugins: [createPlugin()] })
      .run(async ({ flushEvents, intakeRegistry, page }) => {
        const startClocks = clocksNow()
        const eventType = partialEvent.type

        await page.evaluate(
          ({ startClocks, event }) => {
            window.TEST_PLUGIN.addEvent?.(startClocks.relative, event, {})
          },
          { startClocks, event: partialEvent }
        )
        await flushEvents()
        const event = intakeRegistry.rumEvents.filter(
          (e) => e.type === partialEvent.type && (e as any)[eventType]?.id === (partialEvent as any)[eventType].id
        )
        expect(event.length).toBe(1)
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
          window.TEST_PLUGIN.addEvent?.(
            startClocks.relative,
            {
              type: 'view',
              date: startClocks.timeStamp,
              view: {
                id: uuid,
                name: 'TrackedPage',
              },
            } as unknown as AllowedRawRumEvent,
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
