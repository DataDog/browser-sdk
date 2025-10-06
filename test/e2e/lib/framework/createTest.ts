import type { LogsInitConfiguration } from '@datadog/browser-logs'
import type { RumInitConfiguration, RemoteConfiguration } from '@datadog/browser-rum-core'
import type { BrowserContext, Page } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { addTag, addTestOptimizationTags } from '../helpers/tags'
import { getRunId } from '../../../envUtils'
import type { BrowserLog } from '../helpers/browser'
import { BrowserLogsManager, deleteAllCookies, getBrowserName, sendXhr } from '../helpers/browser'
import { DEFAULT_LOGS_CONFIGURATION, DEFAULT_RUM_CONFIGURATION } from '../helpers/configuration'
import { validateRumFormat } from '../helpers/validation'
import type { BrowserConfiguration } from '../../../browsers.conf'
import { IntakeRegistry } from './intakeRegistry'
import { flushEvents } from './flushEvents'
import type { Servers } from './httpServers'
import { getTestServers, waitForServersIdle } from './httpServers'
import type { SetupFactory, SetupOptions, WorkerImplementationFactory } from './pageSetups'
import { workerSetup, html, DEFAULT_SETUPS, npmSetup, reactSetup } from './pageSetups'
import { createIntakeServerApp } from './serverApps/intake'
import { createMockServerApp } from './serverApps/mock'
import type { Extension } from './createExtension'
import { isBrowserStack } from './environment'

export function createTest(title: string) {
  return new TestBuilder(title)
}

interface TestContext {
  baseUrl: string
  intakeRegistry: IntakeRegistry
  servers: Servers
  page: Page
  browserContext: BrowserContext
  browserName: 'chromium' | 'firefox' | 'webkit' | 'msedge'
  getExtensionId: () => Promise<string>
  withBrowserLogs: (cb: (logs: BrowserLog[]) => void) => void
  flushBrowserLogs: () => void
  flushEvents: () => Promise<void>
  deleteAllCookies: () => Promise<void>
  sendXhr: (url: string, headers?: string[][]) => Promise<string>
  interactWithWorker: (cb: (worker: ServiceWorker) => void) => Promise<void>
}

type TestRunner = (testContext: TestContext) => Promise<void> | void

class TestBuilder {
  private rumConfiguration: RumInitConfiguration | undefined = undefined
  private alsoRunWithRumSlim = false
  private logsConfiguration: LogsInitConfiguration | undefined = undefined
  private remoteConfiguration?: RemoteConfiguration = undefined
  private head = ''
  private body = ''
  private basePath = ''
  private eventBridge = false
  private setups: Array<{ factory: SetupFactory; name?: string }> = DEFAULT_SETUPS
  private testFixture: typeof test = test
  private extension: {
    rumConfiguration?: RumInitConfiguration
    logsConfiguration?: LogsInitConfiguration
  } = {}
  private hostName?: string
  private workerImplementationFactory?: (setup: string) => string

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

  withReactApp(appName: string) {
    this.setups = [{ factory: (options, servers) => reactSetup(options, servers, appName) }]
    return this
  }

  withBasePath(newBasePath: string) {
    this.basePath = newBasePath
    return this
  }

  withSetup(setup: SetupFactory) {
    this.setups = [{ factory: setup }]
    return this
  }

  withExtension(extension: Extension) {
    this.testFixture = extension.fixture
    this.extension.rumConfiguration = extension.rumConfiguration
    this.extension.logsConfiguration = extension.logsConfiguration

    return this
  }

  withRemoteConfiguration(remoteConfiguration: RemoteConfiguration) {
    this.remoteConfiguration = remoteConfiguration
    return this
  }

  withWorker(implementation: WorkerImplementationFactory, isModule = false) {
    implementation.isModule = isModule
    this.workerImplementationFactory = implementation

    const options = isModule ? '{ type: "module" }' : '{}'

    // Service workers require HTTPS or localhost due to browser security restrictions
    this.withHostName('localhost')
    this.withBody(html`
      <script>
        if (!window.myServiceWorker && 'serviceWorker' in navigator) {
          navigator.serviceWorker.register('/sw.js', ${options}).then((registration) => {
            window.myServiceWorker = registration
          })
        }
      </script>
    `)

    return this
  }

  withHostName(hostName: string) {
    this.hostName = hostName
    return this
  }

  run(runner: TestRunner) {
    const setupOptions: SetupOptions = {
      body: this.body,
      head: this.head,
      logs: this.logsConfiguration,
      rum: this.rumConfiguration,
      remoteConfiguration: this.remoteConfiguration,
      rumInit: this.rumInit,
      logsInit: this.logsInit,
      useRumSlim: false,
      eventBridge: this.eventBridge,
      basePath: this.basePath,
      context: {
        run_id: getRunId(),
        test_name: '<PLACEHOLDER>',
      },
      testFixture: this.testFixture,
      extension: this.extension,
      hostName: this.hostName,
      workerImplementation: this.workerImplementationFactory,
    }

    if (this.alsoRunWithRumSlim) {
      this.testFixture.describe(this.title, () => {
        declareTestsForSetups('rum', this.setups, setupOptions, runner)
        declareTestsForSetups(
          'rum-slim',
          this.setups.filter((setup) => setup.factory !== npmSetup && setup.factory !== reactSetup),
          { ...setupOptions, useRumSlim: true },
          runner
        )
      })
    } else {
      declareTestsForSetups(this.title, this.setups, setupOptions, runner)
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
    setupOptions.testFixture.describe(title, () => {
      for (const { name, factory } of setups) {
        declareTest(name!, setupOptions, factory, runner)
      }
    })
  } else if (setups.length === 1) {
    declareTest(title, setupOptions, setups[0].factory, runner)
  } else {
    console.warn('no setup available for', title)
  }
}

function declareTest(title: string, setupOptions: SetupOptions, factory: SetupFactory, runner: TestRunner) {
  const testFixture = setupOptions.testFixture ?? test
  testFixture(title, async ({ page, context }) => {
    const browserName = getBrowserName(test.info().project.name)
    addTag('test.browserName', browserName)
    addTestOptimizationTags(test.info().project.metadata as BrowserConfiguration)

    test.skip(
      !!setupOptions.hostName && setupOptions.hostName.endsWith('.localhost') && isBrowserStack,
      // Skip those tests on BrowserStack because it doesn't support localhost subdomains. As a
      // workaround we could use normal domains and use either:
      // * the BrowserStack proxy capabilities -> not tried, but this sounds more complex because
      //   we also want to run tests outside of BrowserStack
      // * the Playwright proxy capabilities -> tried and it seems to fail because of mismatch
      //   version between Playwright local and BrowserStack versions
      // * a "ngrok-like" service -> not tried yet (it sounds more complex)
      //
      // See https://www.browserstack.com/support/faq/local-testing/local-exceptions/i-face-issues-while-testing-localhost-urls-or-private-servers-in-safari-on-macos-os-x-and-ios
      'Localhost subdomains are not supported in BrowserStack'
    )

    const title = test.info().titlePath.join(' > ')
    setupOptions.context.test_name = title

    const servers = await getTestServers()
    const browserLogs = new BrowserLogsManager()

    const testContext = createTestContext(servers, page, context, browserLogs, browserName, setupOptions)
    servers.intake.bindServerApp(createIntakeServerApp(testContext.intakeRegistry))

    const setup = factory(setupOptions, servers)
    servers.base.bindServerApp(
      createMockServerApp(servers, setup, {
        remoteConfiguration: setupOptions.remoteConfiguration,
        workerImplementation: setupOptions.workerImplementation && workerSetup(setupOptions, servers),
      })
    )
    servers.crossOrigin.bindServerApp(createMockServerApp(servers, setup))

    await setUpTest(browserLogs, testContext)

    try {
      await runner(testContext)
      tearDownPassedTest(testContext)
    } finally {
      await tearDownTest(testContext)
    }
  })
}

function createTestContext(
  servers: Servers,
  page: Page,
  browserContext: BrowserContext,
  browserLogsManager: BrowserLogsManager,
  browserName: TestContext['browserName'],
  { basePath, hostName }: SetupOptions
): TestContext {
  const baseUrl = new URL(basePath, servers.base.origin)

  if (hostName) {
    baseUrl.hostname = hostName
  }

  return {
    baseUrl: baseUrl.href,
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
    interactWithWorker: async (cb: (worker: ServiceWorker) => void) => {
      await page.evaluate(`(${cb.toString()})(window.myServiceWorker.active)`)
    },
    flushBrowserLogs: () => browserLogsManager.clear(),
    flushEvents: () => flushEvents(page),
    deleteAllCookies: () => deleteAllCookies(browserContext),
    sendXhr: (url: string, headers?: string[][]) => sendXhr(page, url, headers),
    getExtensionId: async () => {
      let [background] = browserContext.serviceWorkers()
      if (!background) {
        background = await browserContext.waitForEvent('serviceworker')
      }

      const extensionId = background.url().split('/')[2]
      return extensionId || ''
    },
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

function tearDownPassedTest({ intakeRegistry, withBrowserLogs }: TestContext) {
  expect(intakeRegistry.telemetryErrorEvents).toHaveLength(0)
  expect(() => validateRumFormat(intakeRegistry.rumEvents)).not.toThrow()
  withBrowserLogs((logs) => {
    expect(logs.filter((log) => log.level === 'error')).toHaveLength(0)
  })
}

async function tearDownTest({ flushEvents, deleteAllCookies }: TestContext) {
  await flushEvents()
  await deleteAllCookies()

  if (test.info().status === 'passed' && test.info().retry > 0) {
    addTag('test.flaky', 'true')
  }

  const skipReason = test.info().annotations.find((annotation) => annotation.type === 'skip')?.description
  if (skipReason) {
    addTag('test.skip', skipReason)
  }

  const fixmeReason = test.info().annotations.find((annotation) => annotation.type === 'fixme')?.description
  if (fixmeReason) {
    addTag('test.fixme', fixmeReason)
  }
}
