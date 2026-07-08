import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { LogsInitConfiguration } from '@datadog/browser-logs'
import type { DebuggerInitConfiguration } from '@datadog/browser-debugger'
import type { RumInitConfiguration, RemoteConfiguration } from '@datadog/browser-rum-core'
import type { BrowserContext, Page } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { addTag, addTestOptimizationTags } from '../helpers/tags'
import { getRunId } from '../../../envUtils'
import type { BrowserLog } from '../helpers/browser'
import { BrowserLogsManager, deleteAllCookies, getBrowserName, sendXhr } from '../helpers/browser'
import {
  DEFAULT_DEBUGGER_CONFIGURATION,
  DEFAULT_LOGS_CONFIGURATION,
  DEFAULT_RUM_CONFIGURATION,
} from '../helpers/configuration'
import { validateRumFormat } from '../helpers/validation'
import type { BrowserConfiguration } from '../../../browsers.conf'
import {
  NEXTJS_APP_ROUTER_PORT,
  NUXT_APP_PORT,
  NUXT_VUE_ROUTER_V4_APP_PORT,
  VUE_ROUTER_APP_PORT,
  VUE_ROUTER_V4_APP_PORT,
} from '../helpers/playwright'
import { buildSalesforceUrl } from './buildSalesforceUrl'
import type { SalesforceApp } from './buildSalesforceUrl'
import { IntakeRegistry } from './intakeRegistry'
import { flushEvents } from './flushEvents'
import type { Servers } from './httpServers'
import { getTestServers, waitForServersIdle } from './httpServers'
import type { CallerLocation, EventBridgeOptions, SetupFactory, SetupOptions, UrlHook } from './pageSetups'
import { html, DEFAULT_SETUPS, npmSetup, appSetup, formatConfiguration } from './pageSetups'
import { createDatadogHttpApi } from './serverApps/datadogHttpApi'
import type { DatadogHttpApiControl } from './serverApps/datadogHttpApi'
import { createMockServerApp } from './serverApps/mock'
import type { Extension } from './createExtension'
import type { Worker } from './createWorker'
import { isBrowserStack } from './environment'

/**
 * Init script applied to every WebKit context to work around a Playwright-specific
 * quirk observed on the bundled WebKit (Safari 26). Real Safari users are unaffected;
 * this only manifests in Playwright's WebKit fork.
 *
 * Trusted PointerEvent.timeStamp returns a Cocoa-epoch-derived value (~8e11 ms)
 * instead of a DOMHighResTimeStamp. The SDK feeds it into relativeToClocks() and
 * trips the "clock looks weird" guard in trackClickActions — every click action is
 * silently discarded. We wrap Event.prototype.timeStamp to fall back to
 * performance.now() when the raw value is implausibly large (>1 year).
 *
 * Upstream issue: https://github.com/microsoft/playwright/issues/40822
 */
const WEBKIT_PLAYWRIGHT_WORKAROUND = `
(() => {
  // event.timeStamp is a DOMHighResTimeStamp (ms since performance.timeOrigin), so
  // it should always be well below a year. Anything larger is the Cocoa-epoch leak
  // observed on Playwright's bundled WebKit (~8e11 ms, ~25 years).
  const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
  const desc = Object.getOwnPropertyDescriptor(Event.prototype, 'timeStamp');
  if (desc && desc.get) {
    const origGetter = desc.get;
    const cache = new WeakMap();
    Object.defineProperty(Event.prototype, 'timeStamp', {
      configurable: true,
      get() {
        const raw = origGetter.call(this);
        if (raw < ONE_YEAR_MS) return raw;
        if (cache.has(this)) return cache.get(this);
        const fallback = performance.now();
        cache.set(this, fallback);
        return fallback;
      },
    });
  }
})();
`

const salesforceLwcBundlePath = resolve(
  __dirname,
  '../../../apps/sf-lwc-app/force-app/main/default/staticresources/datadog_rum_slim.js'
)

export function createTest(title: string) {
  return new TestBuilder(title, captureCallerLocation())
}

interface TestContext {
  baseUrl: string
  intakeRegistry: IntakeRegistry
  datadogHttpApiControl: DatadogHttpApiControl
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
  evaluateInWorker: (fn: () => void) => Promise<void>
}

type TestRunner = (testContext: TestContext) => Promise<void> | void

class TestBuilder {
  private rumConfiguration: RumInitConfiguration | undefined = undefined
  private alsoRunWithRumSlim = false
  private logsConfiguration: LogsInitConfiguration | undefined = undefined
  private debuggerConfiguration: DebuggerInitConfiguration | undefined = undefined
  private remoteConfiguration?: RemoteConfiguration = undefined
  private head = ''
  private body = ''
  private baseUrlHooks: UrlHook[] = []
  private eventBridge: EventBridgeOptions | undefined
  private setups: Array<{ factory: SetupFactory; name?: string }> = DEFAULT_SETUPS
  private testFixture: typeof test = test
  private mockClock = false
  private extension: {
    rumConfiguration?: RumInitConfiguration
    logsConfiguration?: LogsInitConfiguration
  } = {}
  private worker: Worker | undefined
  private salesforceApp: SalesforceApp | undefined = undefined

  constructor(
    private title: string,
    private callerLocation: CallerLocation | undefined
  ) {}

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

  withDebugger(debuggerInitConfiguration?: Partial<DebuggerInitConfiguration>) {
    this.debuggerConfiguration = { ...DEFAULT_DEBUGGER_CONFIGURATION, ...debuggerInitConfiguration }
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

  withEventBridge(options: EventBridgeOptions = {}) {
    this.eventBridge = options
    return this
  }

  withApp(appName: string) {
    this.setups = [{ factory: (options, servers) => appSetup(options, servers, appName) }]
    return this
  }

  withMockClock() {
    this.mockClock = true
    return this
  }

  withVueApp(routerVersion: 'v4' | 'v5' = 'v5') {
    this.baseUrlHooks.push((baseUrl, servers, { rum, context }) => {
      baseUrl.port = routerVersion === 'v4' ? VUE_ROUTER_V4_APP_PORT : VUE_ROUTER_APP_PORT
      if (rum) {
        baseUrl.searchParams.set('rum-config', formatConfiguration(rum, servers))
      }
      if (context) {
        baseUrl.searchParams.set('rum-context', JSON.stringify(context))
      }
    })
    this.setups = [{ factory: () => '' }]
    return this
  }

  withNextjsApp(router: 'app' | 'pages') {
    const basePath = router === 'pages' ? '/pages-router' : ''
    this.baseUrlHooks.push((baseUrl, servers, { rum, context }) => {
      baseUrl.port = NEXTJS_APP_ROUTER_PORT
      if (basePath) {
        baseUrl.pathname = basePath + (baseUrl.pathname === '/' ? '' : baseUrl.pathname)
      }
      if (rum) {
        baseUrl.searchParams.set('rum-config', formatConfiguration(rum, servers))
      }
      if (context) {
        baseUrl.searchParams.set('rum-context', JSON.stringify(context))
      }
    })
    this.setups = [{ factory: () => '' }]
    return this
  }

  withNuxtApp(routerVersion: 'v4' | 'v5' = 'v5') {
    this.baseUrlHooks.push((baseUrl, servers, { rum, context }) => {
      baseUrl.port = routerVersion === 'v4' ? NUXT_VUE_ROUTER_V4_APP_PORT : NUXT_APP_PORT
      if (rum) {
        baseUrl.searchParams.set('rum-config', formatConfiguration(rum, servers))
      }
      if (context) {
        baseUrl.searchParams.set('rum-context', JSON.stringify(context))
      }
    })
    this.setups = [{ factory: () => '' }]
    return this
  }

  withBasePath(newBasePath: string) {
    this.baseUrlHooks.push((baseUrl) => {
      const parsed = new URL(newBasePath, baseUrl.href)
      baseUrl.pathname = parsed.pathname
      baseUrl.search = parsed.search
    })
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

  withWorker(worker: Worker) {
    this.worker = worker

    const url = worker.importScripts ? '/sw.js?importScripts=true' : '/sw.js'
    const options = worker.importScripts ? '{}' : '{ type: "module" }'

    // Service workers require HTTPS or localhost due to browser security restrictions
    this.withHostName('localhost')
    this.withBody(html`
      <script>
        if (!window.myServiceWorker && 'serviceWorker' in navigator) {
          navigator.serviceWorker.register('${url}', ${options}).then((registration) => {
            window.myServiceWorker = registration
          })
        }
      </script>
    `)

    return this
  }

  withSalesforceApp(app: SalesforceApp) {
    this.salesforceApp = app
    this.setups = [{ factory: () => '' }]
    this.baseUrlHooks.push(async (baseUrl) => {
      baseUrl.href = await buildSalesforceUrl(app)
    })
    return this
  }

  withHostName(hostName: string) {
    this.baseUrlHooks.push((baseUrl) => {
      baseUrl.hostname = hostName
    })
    return this
  }

  run(runner: TestRunner) {
    const setupOptions: SetupOptions = {
      body: this.body,
      head: this.head,
      logs: this.logsConfiguration,
      rum: this.rumConfiguration,
      debugger: this.debuggerConfiguration,
      remoteConfiguration: this.remoteConfiguration,
      rumInit: this.rumInit,
      logsInit: this.logsInit,
      useRumSlim: false,
      eventBridge: this.eventBridge,
      baseUrlHooks: this.baseUrlHooks,
      context: {
        run_id: getRunId(),
        test_name: '<PLACEHOLDER>',
      },
      testFixture: this.testFixture,
      extension: this.extension,
      worker: this.worker,
      callerLocation: this.callerLocation,
      mockClock: this.mockClock,
      salesforceApp: this.salesforceApp,
    }

    if (this.alsoRunWithRumSlim) {
      this.testFixture.describe(this.title, () => {
        declareTestsForSetups('rum', this.setups, setupOptions, runner)
        declareTestsForSetups(
          'rum-slim',
          this.setups.filter((setup) => setup.factory !== npmSetup && setup.factory !== appSetup),
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

/**
 * Captures the location of the caller's caller (i.e. the scenario file that called run()).
 * This is used to override Playwright's default location detection so that test output
 * shows the scenario file instead of createTest.ts.
 */
function captureCallerLocation(): CallerLocation | undefined {
  const error = new Error()
  const lines = error.stack?.split('\n')
  if (!lines || lines.length < 4) {
    return undefined
  }

  // Stack layout:
  // [0] "Error"
  // [1] "    at captureCallerLocation (...)"
  // [2] "    at createTest (...)"
  // [3] "    at <scenario file> (...)"
  const frame = lines[3]
  const match = frame?.match(/\((.+):(\d+):(\d+)\)/) ?? frame?.match(/at (.+):(\d+):(\d+)/)
  if (match) {
    return { file: match[1], line: Number(match[2]), column: Number(match[3]) }
  }
  return undefined
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

/**
 * Resolves the Playwright test function to use for declaring a test.
 *
 * When a callerLocation is available, accesses Playwright's internal TestTypeImpl via its
 * private Symbol to call _createTest() directly with a custom location. This makes test
 * output point to the scenario file instead of createTest.ts.
 */
function resolveTestFunction(setupOptions: SetupOptions): typeof test {
  const testFn = setupOptions.testFixture ?? test
  const testTypeSymbol = Object.getOwnPropertySymbols(testFn).find((s) => s.description === 'testType')

  if (setupOptions.callerLocation && testTypeSymbol) {
    const testTypeImpl = (testFn as any)[testTypeSymbol]
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
    return testTypeImpl._createTest.bind(testTypeImpl, 'default', setupOptions.callerLocation)
  }

  return testFn
}

function declareTest(title: string, setupOptions: SetupOptions, factory: SetupFactory, runner: TestRunner) {
  const testFixture = resolveTestFunction(setupOptions)

  testFixture(title, async ({ page, context }: { page: Page; context: BrowserContext }) => {
    const browserName = getBrowserName(test.info().project.name)
    addTag('test.browserName', browserName)
    addTestOptimizationTags(test.info().project.metadata as BrowserConfiguration)

    // The bug only reproduces on Playwright's macOS WebKit build; skip on every other platform
    // (notably Linux CI runners) to avoid installing the prototype override where it serves no purpose.
    if (browserName === 'webkit' && process.platform === 'darwin') {
      await context.addInitScript(WEBKIT_PLAYWRIGHT_WORKAROUND)
    }

    const servers = await getTestServers()
    const baseUrl = new URL(servers.base.origin)
    // Some hooks (e.g. building the Salesforce URL) need to await network calls before mutating baseUrl
    for (const hook of setupOptions.baseUrlHooks) {
      await hook(baseUrl, servers, setupOptions)
    }

    test.skip(
      baseUrl.hostname.endsWith('.localhost') && isBrowserStack,
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

    const browserLogs = new BrowserLogsManager()

    const intakeRegistry = new IntakeRegistry()
    const datadogHttpApi = createDatadogHttpApi(intakeRegistry)
    const testContext = createTestContext(
      servers,
      intakeRegistry,
      datadogHttpApi.control,
      page,
      context,
      browserLogs,
      browserName,
      baseUrl.href
    )
    servers.datadogHttpApi.bindServerApp(datadogHttpApi.app)

    const setup = factory(setupOptions, servers)
    servers.base.bindServerApp(createMockServerApp(servers, setup, setupOptions))
    servers.crossOrigin.bindServerApp(createMockServerApp(servers, setup))

    if (setupOptions.salesforceApp) {
      // Serve the local bundle from the static resource
      await page.route(/\/resource(?:\/[^/?#]+)?\/datadog_rum_slim(?:\.js)?(?:[/?#].*)?$/, async (route) => {
        await route.fulfill({
          body: await readFile(salesforceLwcBundlePath),
          contentType: 'application/javascript',
        })
      })

      if (setupOptions.rum) {
        if (setupOptions.salesforceApp === 'lwc') {
          await page.addInitScript(
            `window.RUM_CONFIGURATION = ${formatConfiguration(setupOptions.rum, servers)}
          window.RUM_CONTEXT = ${JSON.stringify(setupOptions.context)}`
          )
        } else {
          // Unlike sf-lwc-app (which has a committed datadogInit LWC calling DD_RUM.init), the
          // experience-cloud site relies on Experience Builder's live head markup to load and init
          // the SDK.
          await page.addInitScript(`
          ;(function () {
            function inject() {
              var script = document.createElement('script')
              script.src = '/resource/datadog_rum_slim.js'
              script.onload = function () {
                if (window.RUM_CONTEXT) {
                  window.DD_RUM.setGlobalContext(${JSON.stringify(setupOptions.context)})
                }
                window.DD_RUM.init(${formatConfiguration(setupOptions.rum, servers)})
              }
              document.head.appendChild(script)
            }
            if (document.head) {
              inject()
            } else {
              document.addEventListener('DOMContentLoaded', inject)
            }
          })()
        `)
        }
      }
    }

    await setUpTest(browserLogs, setupOptions, testContext)

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
  intakeRegistry: IntakeRegistry,
  datadogHttpApiControl: DatadogHttpApiControl,
  page: Page,
  browserContext: BrowserContext,
  browserLogsManager: BrowserLogsManager,
  browserName: TestContext['browserName'],
  baseUrl: string
): TestContext {
  return {
    baseUrl,
    intakeRegistry,
    datadogHttpApiControl,
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
    evaluateInWorker: async (fn: () => void) => {
      await page.evaluate(async (code) => {
        const { active, installing, waiting } = window.myServiceWorker
        const worker = active ?? (await waitForActivation(installing ?? waiting!))
        worker.postMessage({ __type: 'evaluate', code })

        function waitForActivation(sw: ServiceWorker): Promise<ServiceWorker> {
          return new Promise((resolve) => {
            sw.addEventListener('statechange', () => {
              if (sw.state === 'activated') {
                resolve(sw)
              }
            })
          })
        }
      }, `(${fn.toString()})()`)
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

async function setUpTest(
  browserLogsManager: BrowserLogsManager,
  { mockClock }: SetupOptions,
  { baseUrl, page, browserContext }: TestContext
) {
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

  if (mockClock) {
    try {
      await page.clock.install()
    } catch (e) {
      test.skip(true, `Mock clock is not supported in this browser: ${String(e)}`)
    }
  }
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

async function tearDownTest({ page, flushEvents, deleteAllCookies }: TestContext) {
  if (!page.url().includes('/flush')) {
    await flushEvents()
  }
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
