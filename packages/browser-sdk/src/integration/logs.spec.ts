import { createSdk } from '../domain/sdk'
import { consoleModule } from '@datadog/browser-console-next'
import { errorsModule } from '@datadog/browser-errors-next'
import { logsModule } from '@datadog/browser-logs-next'
import { unregisterSdk } from '@datadog/core-next'
import type { LogsPublicApi } from '@datadog/browser-logs-next'

// Helper to drain the async pipeline microtask queue
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

// Helper to trigger a batch flush by simulating page hide
function flushBatch(): void {
  const originalVisibilityState = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')
  Object.defineProperty(document, 'visibilityState', {
    value: 'hidden',
    configurable: true,
  })
  document.dispatchEvent(new Event('visibilitychange'))
  // Restore
  if (originalVisibilityState) {
    Object.defineProperty(document, 'visibilityState', originalVisibilityState)
  } else {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (document as any).visibilityState
  }
}

const baseConfig = {
  clientToken: 'test-token',
  site: 'datadoghq.com',
  modules: [consoleModule, errorsModule, logsModule],
  logs: {
    forwardErrorsToLogs: true,
    forwardConsoleLogs: 'all' as const,
  },
}

describe('logs integration', () => {
  let fetchSpy: jasmine.Spy
  let originalConsoleError: typeof console.error
  let currentSdk: any

  beforeEach(() => {
    // Save original console.error BEFORE creating the SDK (console module patches it)
    originalConsoleError = console.error
    currentSdk = null

    fetchSpy = spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response(null, { status: 200 })))
  })

  afterEach(() => {
    // Clean up SDK event listeners to avoid leaked listener warnings
    if (currentSdk?.__stop) {
      currentSdk.__stop()
    }
    unregisterSdk('default')
    // Restore console methods (console module patches them)
    console.error = originalConsoleError
    // Delete the memory store session state
    delete (globalThis as any)._DD_SESSION
  })

  it('logger info flow: logger.info sends a log event with origin logger', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [logsModule],
      logs: {},
    })

    const logs = currentSdk!['logs'] as LogsPublicApi
    logs.logger.info('checkout started')

    await tick()
    flushBatch()

    expect(fetchSpy).toHaveBeenCalled()
    const body = (fetchSpy.calls.mostRecent().args[1] as RequestInit).body as string
    expect(body).toContain('checkout started')
    expect(body).toContain('"origin":"logger"')
  })

  it('console forwarding: console.error sends a log event with origin console', async () => {
    currentSdk = await createSdk(baseConfig)

    expect(currentSdk).not.toBeNull()

    // console module patched console.error — call the patched version
    console.error('something broke')

    await tick()
    flushBatch()

    expect(fetchSpy).toHaveBeenCalled()
    const body = (fetchSpy.calls.mostRecent().args[1] as RequestInit).body as string
    expect(body).toContain('something broke')
    expect(body).toContain('"origin":"console"')
  })

  it('runtime error forwarding: dispatching an ErrorEvent sends a log event with origin source', async () => {
    currentSdk = await createSdk(baseConfig)

    expect(currentSdk).not.toBeNull()

    // Prevent Jasmine from catching uncaught errors and failing the test
    spyOn(window as any, 'onerror')

    const errorEvent = new ErrorEvent('error', {
      message: 'runtime failure',
      error: new Error('runtime failure'),
    })
    window.dispatchEvent(errorEvent)

    await tick()
    flushBatch()

    expect(fetchSpy).toHaveBeenCalled()
    const body = (fetchSpy.calls.mostRecent().args[1] as RequestInit).body as string
    expect(body).toContain('"origin":"source"')
  })

  it('beforeSend filtering: returning false from beforeSend prevents fetch from being called', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [logsModule],
      logs: {
        beforeSend: () => false,
      },
    })

    const logs = currentSdk!['logs'] as LogsPublicApi
    logs.logger.info('dropped')

    await tick()
    flushBatch()

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('global context enrichment: setGlobalContext properties appear in the fetch body', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [logsModule],
      logs: {},
    })

    const logs = currentSdk!['logs'] as LogsPublicApi
    logs.setGlobalContext({ env: 'prod' })
    logs.logger.info('test')

    await tick()
    flushBatch()

    expect(fetchSpy).toHaveBeenCalled()
    const body = (fetchSpy.calls.mostRecent().args[1] as RequestInit).body as string
    expect(body).toContain('"env":"prod"')
  })
})
