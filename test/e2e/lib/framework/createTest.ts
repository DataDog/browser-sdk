import type { LogsInitConfiguration } from '@datadog/browser-logs'
import type { RumInitConfiguration } from '@datadog/browser-rum-core'
import { deleteAllCookies, getBrowserName, withBrowserLogs } from '../helpers/browser'
import { validateRumFormat } from '../helpers/validation'
import { EventRegistry } from './eventsRegistry'
import { flushEvents } from './flushEvents'
import type { Servers } from './httpServers'
import { getTestServers, waitForServersIdle } from './httpServers'
import { log } from './logger'
import type { SetupFactory, SetupOptions } from './pageSetups'
import { DEFAULT_SETUPS, npmSetup } from './pageSetups'
import { createIntakeServerApp } from './serverApps/intake'
import { createMockServerApp } from './serverApps/mock'

const DEFAULT_RUM_CONFIGURATION = {
  applicationId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  clientToken: 'token',
  sessionReplaySampleRate: 100,
  trackResources: true,
  trackLongTasks: true,
  telemetrySampleRate: 100,
  telemetryConfigurationSampleRate: 100,
  enableExperimentalFeatures: ['fetch_duration'],
}

const DEFAULT_LOGS_CONFIGURATION = {
  clientToken: 'token',
  telemetrySampleRate: 100,
  telemetryConfigurationSampleRate: 100,
}

export function createTest(title: string) {
  return new TestBuilder(title)
}

interface TestContext {
  baseUrl: string
  crossOriginUrl: string
  serverEvents: EventRegistry
  bridgeEvents: EventRegistry
  servers: Servers
}

type TestRunner = (testContext: TestContext) => Promise<void>

class TestBuilder {
  private rumConfiguration: RumInitConfiguration | undefined = undefined
  private alsoRunWithRumSlim = false
  private logsConfiguration: LogsInitConfiguration | undefined = undefined
  private head = ''
  private body = ''
  private eventBridge = false
  private setups: Array<{ factory: SetupFactory; name?: string }> = []

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
      logs: this.logsConfiguration,
      rum: this.rumConfiguration,
      rumInit: this.rumInit,
      useRumSlim: false,
      eventBridge: this.eventBridge,
    }

    if (this.alsoRunWithRumSlim) {
      describe(this.title, () => {
        declareTestsForSetups('rum', setups, setupOptions, runner)
        declareTestsForSetups(
          'rum-slim',
          setups.filter((setup) => setup.factory !== npmSetup),
          { ...setupOptions, useRumSlim: true },
          runner
        )
      })
    } else {
      declareTestsForSetups(this.title, setups, setupOptions, runner)
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
  setups: Array<{ factory: SetupFactory; name?: string }>,
  setupOptions: SetupOptions,
  runner: TestRunner
) {
  if (setups.length > 1) {
    describe(title, () => {
      for (const { name, factory } of setups) {
        declareTest(name!, setupOptions, factory, runner)
      }
    })
  } else {
    declareTest(title, setupOptions, setups[0].factory, runner)
  }
}

function declareTest(title: string, setupOptions: SetupOptions, factory: SetupFactory, runner: TestRunner) {
  const spec = it(title, async () => {
    log(`Start '${spec.getFullName()}' in ${getBrowserName()}`)
    const servers = await getTestServers()

    const testContext = createTestContext(servers)
    servers.intake.bindServerApp(createIntakeServerApp(testContext.serverEvents, testContext.bridgeEvents))

    const setup = factory(setupOptions, servers)
    servers.base.bindServerApp(createMockServerApp(servers, setup))
    servers.crossOrigin.bindServerApp(createMockServerApp(servers, setup))

    await setUpTest(testContext)

    try {
      await runner(testContext)
    } finally {
      await tearDownTest(testContext)
      log(`End '${spec.getFullName()}'`)
    }
  })
}

function createTestContext(servers: Servers): TestContext {
  return {
    baseUrl: servers.base.url,
    crossOriginUrl: servers.crossOrigin.url,
    serverEvents: new EventRegistry(),
    bridgeEvents: new EventRegistry(),
    servers,
  }
}

async function setUpTest({ baseUrl }: TestContext) {
  await browser.url(baseUrl)
  await waitForServersIdle()
}

async function tearDownTest({ serverEvents, bridgeEvents }: TestContext) {
  await flushEvents()
  expect(serverEvents.telemetryErrors).toEqual([])
  validateRumFormat(serverEvents.rum)
  validateRumFormat(bridgeEvents.rum)
  await withBrowserLogs((logs) => {
    logs.forEach((browserLog) => {
      log(`Browser ${browserLog.source}: ${browserLog.level} ${browserLog.message}`)
    })
    expect(logs.filter((l) => (l as any).level === 'SEVERE')).toEqual([])
  })
  await deleteAllCookies()
}
