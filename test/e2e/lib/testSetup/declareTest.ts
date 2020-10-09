import { deleteAllCookies, withBrowserLogs } from '../browserHelpers'
import { log } from '../logger'
import { flushEvents } from '../sdkHelpers'
import { getTestServers, Servers, waitForServersIdle } from '../servers'
import { EventRegistry } from './eventsRegistry'
import { createIntakeServerApp } from './intakeServerApp'
import { createMockServerApp } from './mockServerApp'
import { Endpoints } from './sdkBuilds'

export interface TestContext {
  baseUrl: string
  crossOriginUrl: string
  events: EventRegistry
  endpoints: Endpoints
}
export type TestRunner = (testContext: TestContext) => Promise<void>

interface ItResult {
  getFullName(): string
}
declare function it(expectation: string, assertion?: jasmine.ImplementationCallback, timeout?: number): ItResult

export function declareTest(title: string, setup: string, runner: TestRunner) {
  const spec = it(title, async () => {
    log(`Start '${spec.getFullName()}' in ${getBrowserName()}`)
    const servers = await getTestServers()

    const testContext = createTestContext(servers)

    servers.base.bindServerApp(createMockServerApp(testContext.endpoints, setup))
    servers.crossOrigin.bindServerApp(createMockServerApp(testContext.endpoints, setup))
    servers.intake.bindServerApp(createIntakeServerApp(testContext.events))

    await setUpTest(testContext)

    try {
      await runner(testContext)
    } finally {
      await tearDownTest(testContext)
      log(`End '${spec.getFullName()}'`)
    }
  })
}

function getBrowserName() {
  const capabilities = browser.options.capabilities
  return capabilities && (capabilities.browserName || (capabilities as any).browser)
}

function createTestContext(servers: Servers): TestContext {
  return {
    baseUrl: servers.base.url,
    crossOriginUrl: servers.crossOrigin.url,
    endpoints: {
      internalMonitoring: `${servers.intake.url}/v1/input/internalMonitoring`,
      logs: `${servers.intake.url}/v1/input/logs`,
      rum: `${servers.intake.url}/v1/input/rum`,
    },
    events: new EventRegistry(),
  }
}

async function setUpTest({ baseUrl }: TestContext) {
  await browser.url(baseUrl)
  await waitForServersIdle()
}

async function tearDownTest({ events }: TestContext) {
  await flushEvents()
  expect(events.internalMonitoring).toEqual([])
  await withBrowserLogs((logs) => {
    logs.forEach((browserLog) => {
      log(`Browser ${browserLog.source}: ${browserLog.level} ${browserLog.message}`)
    })
    expect(logs.filter((l) => (l as any).level === 'SEVERE')).toEqual([])
  })
  await deleteAllCookies()
}
