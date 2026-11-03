// Checks that the Angular integration doesn't keep server-rendered applications in memory
// (https://github.com/DataDog/browser-sdk/issues/5193): RUM never starts on the server, so what the
// integration holds until RUM starts must not retain the application.
// Runs against test/apps/angular-ssr-app, an Angular CLI app with server-side rendering.
import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { ANGULAR_SSR_APP_PORT } from '../../lib/helpers/playwright'

const RENDERS = 20
const ORIGIN = `http://localhost:${ANGULAR_SSR_APP_PORT}`

interface SsrLeakReport {
  aliveRenders: number
  trackedRenders: number
}

/**
 * Renders `path` RENDERS times and returns how many of these renders are still in memory: RENDERS
 * when every render is retained, close to 0 otherwise.
 */
async function countRetainedRenders(request: APIRequestContext, path: string) {
  const getReport = async () => (await (await request.get(`${ORIGIN}/__ssr-leak`)).json()) as SsrLeakReport

  const before = await getReport()
  for (let i = 0; i < RENDERS; i++) {
    const response = await request.get(`${ORIGIN}${path}`)
    expect(response.status(), await response.text()).toBe(200)
  }
  const after = await getReport()

  // Guards against a broken probe: 0 retained renders only means something if renders were tracked
  expect(after.trackedRenders - before.trackedRenders).toBe(RENDERS)
  return after.aliveRenders - before.aliveRenders
}

test.describe('plugin: angular SSR', () => {
  // In order: the tests share the server, a leaking test would affect the others
  test.describe.configure({ mode: 'default' })

  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'chromium', 'server-side only, browser independent')
  })

  test('does not retain server renders with provideDatadogRouter()', async ({ request }) => {
    expect(await countRetainedRenders(request, '/user/42')).toBeLessThan(RENDERS / 2)
  })

  test('does not retain server renders reporting errors to provideDatadogErrorHandler()', async ({ request }) => {
    expect(await countRetainedRenders(request, '/ssr-error')).toBeLessThan(RENDERS / 2)
  })
})
