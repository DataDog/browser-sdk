import { LogsInitConfiguration } from '@datadog/browser-logs'
import { RumInitConfiguration } from '@datadog/browser-rum-core'
import { deleteAllCookies, withBrowserLogs } from '../helpers/browser'
import { flushEvents } from '../helpers/flushEvents'
import { validateFormat } from '../helpers/validation'
import { EventRegistry } from './eventsRegistry'
import { getTestServers, Servers, waitForServersIdle } from './httpServers'
import { log } from './logger'
import { DEFAULT_PAGE_SETUPS, npmSetup, PageFactory, PageSetupOptions } from './pageSetups'
import { createIntakeServerApp } from './serverApps/intake'
import { createMockServerApp } from './serverApps/mock'

const DEFAULT_RUM_CONFIGURATION = {
  applicationId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  clientToken: 'token',
  enableExperimentalFeatures: [],
}

const DEFAULT_LOGS_CONFIGURATION = {
  clientToken: 'token',
}

export function createTest(title: string) {
  return new TestBuilder(title)
}

interface TestContext {
  baseUrl: string
  crossOriginUrl: string
  serverEvents: EventRegistry
  bridgeEvents: EventRegistry
}

type TestRunner = (testContext: TestContext) => Promise<void>

class TestBuilder {
  private rumConfiguration: RumInitConfiguration | undefined = undefined
  private alsoRunWithRumSlim = false
  private logsConfiguration: LogsInitConfiguration | undefined = undefined
  private head = ''
  private body = ''
  private eventBridge = false
  private pageSetups: Array<{ pageFactory: PageFactory; name?: string }> = []

  constructor(private title: string) {}

  withRum(rumInitConfiguration?: Partial<RumInitConfiguration>) {
    this.rumConfiguration = { ...DEFAULT_RUM_CONFIGURATION, ...rumInitConfiguration }
    return this
  }

  withRumSlim() {
    this.alsoRunWithRumSlim = true
    return this
  }

  withRumInit(rumInit: (initConfiguration: RumInitConfiguration) => void) {
    this.rumInit = rumInit
    return this
  }

  withLogs(logsInitConfiguration?: Partial<LogsInitConfiguration>) {
    this.logsConfiguration = { ...DEFAULT_LOGS_CONFIGURATION, ...logsInitConfiguration }
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

  withEventBridge() {
    this.eventBridge = true
    return this
  }

  withSetup(pageFactory: PageFactory, name?: string) {
    this.pageSetups.push({ pageFactory, name })
    if (this.pageSetups.length > 1 && this.pageSetups.some((item) => !item.name)) {
      throw new Error('Tests with multiple setups need to give a name to each setups')
    }
    return this
  }

  run(runner: TestRunner) {
    const pageSetups = this.pageSetups.length ? this.pageSetups : DEFAULT_PAGE_SETUPS

    const pageSetupOptions: PageSetupOptions = {
      body: this.body,
      head: this.head,
      logs: this.logsConfiguration,
      rum: this.rumConfiguration,
      rumInit: this.rumInit,
      useRumSlim: false,
      eventBridge: this.eventBridge,
    }

    if (this.alsoRunWithRumSlim) {
      describe(this.title, () => {
        declareTestsForSetups('rum', pageSetups, pageSetupOptions, runner)
        declareTestsForSetups(
          'rum-slim',
          pageSetups.filter((pageSetup) => pageSetup.pageFactory !== npmSetup),
          { ...pageSetupOptions, useRumSlim: true },
          runner
        )
      })
    } else {
      declareTestsForSetups(this.title, pageSetups, pageSetupOptions, runner)
    }
  }

  private rumInit: (configuration: RumInitConfiguration) => void = (configuration) => {
    window.DD_RUM!.init(configuration)
  }
}

interface ItResult {
  getFullName(): string
}
declare function it(expectation: string, assertion?: jasmine.ImplementationCallback, timeout?: number): ItResult

function declareTestsForSetups(
  title: string,
  pageSetups: Array<{ pageFactory: PageFactory; name?: string }>,
  pageSetupOptions: PageSetupOptions,
  runner: TestRunner
) {
  if (pageSetups.length > 1) {
    describe(title, () => {
      for (const { name, pageFactory } of pageSetups) {
        declareTest(name!, pageSetupOptions, pageFactory, runner)
      }
    })
  } else {
    const { pageFactory } = pageSetups[0]
    declareTest(title, pageSetupOptions, pageFactory, runner)
  }
}

function declareTest(title: string, pageSetupOptions: PageSetupOptions, pageFactory: PageFactory, runner: TestRunner) {
  const spec = it(title, async () => {
    log(`Start '${spec.getFullName()}' in ${getBrowserName()!}`)
    const servers = await getTestServers()

    const testContext = createTestContext(servers)
    servers.intake.bindServerApp(createIntakeServerApp(testContext.serverEvents, testContext.bridgeEvents))

    const page = pageFactory(pageSetupOptions, servers.intake.url)
    servers.base.bindServerApp(createMockServerApp(servers, page))
    servers.crossOrigin.bindServerApp(createMockServerApp(servers, page))

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
    serverEvents: new EventRegistry(),
    bridgeEvents: new EventRegistry(),
  }
}

async function setUpTest({ baseUrl }: TestContext) {
  await browser.url(baseUrl)
  await waitForServersIdle()
}

async function tearDownTest({ serverEvents, bridgeEvents }: TestContext) {
  await flushEvents()
  expect(serverEvents.internalMonitoring).toEqual([])
  validateFormat(serverEvents.rum)
  validateFormat(bridgeEvents.rum)
  await withBrowserLogs((logs) => {
    logs.forEach((browserLog) => {
      log(`Browser ${browserLog.source}: ${browserLog.level} ${browserLog.message}`)
    })
    expect(logs.filter((l) => (l as any).level === 'SEVERE')).toEqual([])
  })
  await deleteAllCookies()
}
