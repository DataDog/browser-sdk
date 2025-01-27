import type { LogsInitConfiguration } from '@datadog/browser-logs'
import type { RumInitConfiguration } from '@datadog/browser-rum-core'
import { DefaultPrivacyLevel } from '@datadog/browser-rum'
import type { BrowserContext, Page } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { getRunId } from '../../../envUtils'
import { BrowserLog } from '../helpers/browser'
import { BrowserLogsManager, deleteAllCookies, sendXhr } from '../helpers/browser'
import { APPLICATION_ID, CLIENT_TOKEN } from '../helpers/configuration'
import { validateRumFormat } from '../helpers/validation'
import { IntakeRegistry } from './intakeRegistry'
import { flushEvents } from './flushEvents'
import type { Servers } from './httpServers'
import { getTestServers, waitForServersIdle } from './httpServers'
import { log } from './logger'
import type { SetupFactory, SetupOptions } from './pageSetups'
import { DEFAULT_SETUPS, npmSetup } from './pageSetups'
import { createIntakeServerApp } from './serverApps/intake'
import { createMockServerApp } from './serverApps/mock'

const DEFAULT_RUM_CONFIGURATION = {
  applicationId: APPLICATION_ID,
  clientToken: CLIENT_TOKEN,
  defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW,
  trackResources: true,
  trackLongTasks: true,
  enableExperimentalFeatures: [],
  allowUntrustedEvents: true,
  // Force All sample rates to 100% to avoid flakiness
  sessionReplaySampleRate: 100,
  telemetrySampleRate: 100,
  telemetryUsageSampleRate: 100,
  telemetryConfigurationSampleRate: 100,
}

const DEFAULT_LOGS_CONFIGURATION = {
  clientToken: CLIENT_TOKEN,
  // Force All sample rates to 100% to avoid flakiness
  telemetrySampleRate: 100,
  telemetryUsageSampleRate: 100,
  telemetryConfigurationSampleRate: 100,
}

export function createTest(title: string) {
  return new TestBuilder(title)
}

interface TestContext {
  baseUrl: string
  crossOriginUrl: string
  intakeRegistry: IntakeRegistry
  servers: Servers
  page: Page
  browserContext: BrowserContext
  browserName: 'chromium' | 'firefox' | 'webkit'
  withBrowserLogs: (cb: (logs: BrowserLog[]) => void) => void
  flushBrowserLogs: () => void
  flushEvents: () => Promise<void>
  deleteAllCookies: () => Promise<void>
  sendXhr: (url: string, headers?: string[][]) => Promise<string>
}

type TestRunner = (testContext: TestContext) => Promise<void> | void

class TestBuilder {
  private rumConfiguration: RumInitConfiguration | undefined = undefined
  private alsoRunWithRumSlim = false
  private logsConfiguration: LogsInitConfiguration | undefined = undefined
  private head = ''
  private body = ''
  private basePath = ''
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

  withLogsInit(logsInit: (initConfiguration: LogsInitConfiguration) => void) {
    this.logsInit = logsInit
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

  withBasePath(newBasePath: string) {
    this.basePath = newBasePath
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
      logsInit: this.logsInit,
      useRumSlim: false,
      eventBridge: this.eventBridge,
      basePath: this.basePath,
      context: {
        run_id: getRunId(),
        test_name: '<PLACEHOLDER>',
      },
    }

    if (this.alsoRunWithRumSlim) {
      test.describe(this.title, () => {
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

  private logsInit: (configuration: LogsInitConfiguration) => void = (configuration) => {
    window.DD_LOGS!.init(configuration)
  }
}

function declareTestsForSetups(
  title: string,
  setups: Array<{ factory: SetupFactory; name?: string }>,
  setupOptions: SetupOptions,
  runner: TestRunner
) {
  if (setups.length > 1) {
    test.describe(title, () => {
      for (const { name, factory } of setups) {
        declareTest(name!, setupOptions, factory, runner)
      }
    })
  } else {
    declareTest(title, setupOptions, setups[0].factory, runner)
  }
}

function declareTest(title: string, setupOptions: SetupOptions, factory: SetupFactory, runner: TestRunner) {
  test(title, async ({ page, context, browserName }) => {
    const title = test.info().titlePath.join(' > ')
    log(`Start '${title}' in ${browserName}`)

    setupOptions.context.test_name = title

    const servers = await getTestServers()
    const browserLogs = new BrowserLogsManager()

    const testContext = createTestContext(servers, page, context, browserLogs, browserName, setupOptions)
    servers.intake.bindServerApp(createIntakeServerApp(testContext.intakeRegistry))

    const setup = factory(setupOptions, servers)
    servers.base.bindServerApp(createMockServerApp(servers, setup))
    servers.crossOrigin.bindServerApp(createMockServerApp(servers, setup))

    await setUpTest(browserLogs, testContext)

    try {
      await runner(testContext)
    } finally {
      await tearDownTest(testContext)
      log(`End '${title}'`)
    }
  })
}

function createTestContext(
  servers: Servers,
  page: Page,
  browserContext: BrowserContext,
  browserLogsManager: BrowserLogsManager,
  browserName: TestContext['browserName'],
  { basePath }: SetupOptions
): TestContext {
  return {
    baseUrl: servers.base.url + basePath,
    crossOriginUrl: servers.crossOrigin.url,
    intakeRegistry: new IntakeRegistry(),
    servers,
    page,
    browserContext,
    browserName,
    withBrowserLogs: (cb: (logs: BrowserLog[]) => void) => {
      try {
        cb(browserLogsManager.get())
      } finally {
        browserLogsManager.clear()
      }
    },
    flushBrowserLogs: () => {
      browserLogsManager.clear()
    },
    flushEvents: () => flushEvents(page),
    deleteAllCookies: () => deleteAllCookies(browserContext),
    sendXhr: (url: string, headers: string[][]) => sendXhr(page, url, headers),
  }
}

async function setUpTest(browserLogsManager: BrowserLogsManager, { baseUrl, page, browserContext }: TestContext) {
  browserContext.on('console', (msg) => {
    browserLogsManager.add({
      level: msg.type() as BrowserLog['level'],
      message: msg.text(),
      source: 'console',
      timestamp: Date.now(),
    })
  })

  browserContext.on('weberror', (webError) => {
    browserLogsManager.add({
      level: 'error',
      message: webError.error().message,
      source: 'console',
      timestamp: Date.now(),
    })
  })

  await page.goto(baseUrl)
  await waitForServersIdle()
}

async function tearDownTest({ intakeRegistry, withBrowserLogs, flushEvents, deleteAllCookies }: TestContext) {
  await flushEvents()
  expect(intakeRegistry.telemetryErrorEvents).toEqual([])
  validateRumFormat(intakeRegistry.rumEvents)
  withBrowserLogs((logs) => {
    logs.forEach((browserLog) => {
      log(`Browser ${browserLog.source}: ${browserLog.level} ${browserLog.message}`)
    })
    expect(logs.filter((log) => log.level === 'error')).toEqual([])
  })
  await deleteAllCookies()
}
