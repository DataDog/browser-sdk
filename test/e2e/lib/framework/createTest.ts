import { deleteAllCookies, withBrowserLogs } from '../helpers/browser'
import { flushEvents } from '../helpers/sdk'
import { validateFormat } from '../helpers/validation'
import { EventRegistry } from './eventsRegistry'
import { getTestServers, Servers, waitForServersIdle } from './httpServers'
import { log } from './logger'
import { DEFAULT_SETUPS, LogsSetupOptions, RumSetupOptions, SetupFactory, SetupOptions } from './pageSetups'
import { Endpoints } from './sdkBuilds'
import { createIntakeServerApp } from './serverApps/intake'
import { createMockServerApp } from './serverApps/mock'

const DEFAULT_RUM_OPTIONS = {
  applicationId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  clientToken: 'token',
  enableExperimentalFeatures: [],
}

const DEFAULT_LOGS_OPTIONS = {
  clientToken: 'token',
}

export function createTest(title: string) {
  return new TestBuilder(title)
}

interface TestContext {
  baseUrl: string
  crossOriginUrl: string
  events: EventRegistry
  endpoints: Endpoints
}

type TestRunner = (testContext: TestContext) => Promise<void>

class TestBuilder {
  private rumOptions: RumSetupOptions | undefined = undefined
  private logsOptions: LogsSetupOptions | undefined = undefined
  private head = ''
  private body = ''
  private setups: Array<{ factory: SetupFactory; name?: string }> = []

  constructor(private title: string) {}

  withRum(rumOptions?: RumSetupOptions) {
    this.rumOptions = { ...DEFAULT_RUM_OPTIONS, ...rumOptions }
    return this
  }

  withLogs(logsOptions?: LogsSetupOptions) {
    this.logsOptions = { ...DEFAULT_LOGS_OPTIONS, ...logsOptions }
    return this
  }

  withHead(head: string) {
    this.head = head
    return this
  }

  withBody(body: string) {
    this.body = body
    return this
  }

  withSetup(factory: SetupFactory, name?: string) {
    this.setups.push({ factory, name })
    if (this.setups.length > 1 && this.setups.some((item) => !item.name)) {
      throw new Error('Tests with multiple setups need to give a name to each setups')
    }
    return this
  }

  run(runner: TestRunner) {
    const setups = this.setups.length ? this.setups : DEFAULT_SETUPS

    const setupOptions: SetupOptions = {
      body: this.body,
      head: this.head,
      logs: this.logsOptions,
      rum: this.rumOptions,
    }

    if (setups.length > 1) {
      describe(this.title, () => {
        for (const { name, factory } of setups) {
          declareTest(name!, factory(setupOptions), runner)
        }
      })
    } else {
      declareTest(this.title, setups[0].factory(setupOptions), runner)
    }
  }
}

interface ItResult {
  getFullName(): string
}
declare function it(expectation: string, assertion?: jasmine.ImplementationCallback, timeout?: number): ItResult

function declareTest(title: string, setup: string, runner: TestRunner) {
  const spec = it(title, async () => {
    log(`Start '${spec.getFullName()}' in ${getBrowserName()!}`)
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
  return capabilities && ((capabilities.browserName || (capabilities as any).browser) as string)
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
  validateFormat(events.rum)
  await withBrowserLogs((logs) => {
    logs.forEach((browserLog) => {
      log(`Browser ${browserLog.source}: ${browserLog.level} ${browserLog.message}`)
    })
    expect(logs.filter((l) => (l as any).level === 'SEVERE')).toEqual([])
  })
  await deleteAllCookies()
}
