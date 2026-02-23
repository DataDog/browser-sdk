import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createTest } from '../lib/framework'

test.describe('profiling', () => {
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'chromium', 'JS Profiling API is only available in Chromium')
  })

  createTest('send profile events when profiling is enabled')
    .withRum({ profilingSampleRate: 100 })
    .withBasePath('/?js-profiling=true')
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await generateLongTask(page)

      await flushEvents()

      expect(intakeRegistry.profileRequests).toHaveLength(1)

      // Extract RUM event IDs for verification
      const viewIds = intakeRegistry.rumViewEvents.map((event) => event.view.id)
      const longTaskIds = intakeRegistry.rumLongTaskEvents.map((event) => event.long_task.id)

      const profileEvent = intakeRegistry.profileEvents[0]

      // Verify complete structure
      expect(profileEvent).toEqual({
        application: {
          id: expect.any(String),
        },
        session: {
          id: expect.any(String),
        },
        view: {
          id: viewIds,
          name: ['/'],
        },
        long_task: {
          id: expect.arrayOf(expect.any(String)),
        },
        attachments: ['wall-time.json'],
        start: expect.any(String), // ISO 8601 date string
        end: expect.any(String), // ISO 8601 date string
        family: 'chrome',
        runtime: 'chrome',
        format: 'json',
        version: 4,
        tags_profiler: 'sdk_version:dev,language:javascript,runtime:chrome,family:chrome,host:browser',
        _dd: {
          clock_drift: expect.any(Number),
        },
      })

      // Verify profile event long tasks are a subset of RUM long tasks
      for (const profileLongTaskId of profileEvent.long_task!.id) {
        expect(longTaskIds).toContain(profileLongTaskId)
      }

      // Verify wall-time.json trace data
      const profileRequest = intakeRegistry.profileRequests[0]

      // Verify trace file metadata
      expect(profileRequest.traceFile.encoding).toBe(null)
      expect(profileRequest.traceFile.filename).toBe('wall-time.json')

      expect(profileRequest.trace).toEqual({
        resources: expect.any(Array),
        frames: expect.any(Array),
        stacks: expect.any(Array),
        samples: expect.any(Array),
        startClocks: {
          relative: expect.any(Number),
          timeStamp: expect.any(Number),
        },
        endClocks: {
          relative: expect.any(Number),
          timeStamp: expect.any(Number),
        },
        clocksOrigin: {
          relative: expect.any(Number),
          timeStamp: expect.any(Number),
        },
        sampleInterval: expect.any(Number),
        longTasks: profileEvent.long_task!.id.map((id) => ({
          duration: expect.any(Number),
          entryType: expect.stringMatching(/^(long-animation-frame|longtask)$/),
          id,
          startClocks: {
            relative: expect.any(Number),
            timeStamp: expect.any(Number),
          },
        })),
        views: viewIds.map((viewId) => ({
          startClocks: {
            relative: expect.any(Number),
            timeStamp: expect.any(Number),
          },
          viewId,
          viewName: '/',
        })),
      })

      // Verify we collected some samples
      expect(profileRequest.trace.samples.length).toBeGreaterThan(0)
    })

  createTest('send compressed profile events when compressIntakeRequests is enabled')
    .withRum({ profilingSampleRate: 100, compressIntakeRequests: true })
    .withBasePath('/?js-profiling=true')
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await generateLongTask(page)

      await flushEvents()

      expect(intakeRegistry.profileRequests).toHaveLength(1)

      const profileRequest = intakeRegistry.profileRequests[0]

      expect(profileRequest.traceFile.encoding).toBe('deflate')
      expect(profileRequest.traceFile.filename).toBe('wall-time.json')

      expect(profileRequest.event).toBeDefined()
      expect(profileRequest.trace).toBeDefined()
      expect(profileRequest.trace.samples.length).toBeGreaterThan(0)
    })

  createTest('display console warning when Document-Policy header is missing')
    .withRum({ profilingSampleRate: 100 })
    .run(async ({ intakeRegistry, flushEvents, withBrowserLogs }) => {
      await flushEvents()

      expect(intakeRegistry.profileRequests).toHaveLength(0)

      withBrowserLogs((browserLogs) => {
        const profilingWarnings = browserLogs.filter((log) =>
          log.message.includes(
            'Datadog Browser SDK: [DD_RUM] Profiler startup failed. Ensure your server includes the `Document-Policy: js-profiling` response header when serving HTML pages'
          )
        )
        expect(profilingWarnings.length).toBeGreaterThan(0)
      })
    })

  createTest('do not send profile events when profiling is not enabled')
    .withRum()
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await generateLongTask(page)

      await flushEvents()

      expect(intakeRegistry.profileRequests).toHaveLength(0)
    })
})

async function generateLongTask(page: Page, durationMs = 500) {
  await page.evaluate(
    (duration) =>
      new Promise<void>((resolve) => {
        setTimeout(() => {
          const start = Date.now()
          while (Date.now() - start < duration) {
            /* empty */
          }
          resolve()
        })
      }),
    durationMs
  )
}
