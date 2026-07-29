import { CACHE_VERSION, buildCacheKey, display, fetchRemoteConfiguration } from '@datadog/browser-core'
import { interceptRequests, registerCleanupTask, replaceMockableWithSpy } from '@datadog/browser-core/test'
import type { LogsInitConfiguration } from './configuration'
import {
  applyLogsRemoteConfiguration,
  fetchAndApplyLogsRemoteConfiguration,
  getLogsRemoteConfiguration,
} from './remoteConfiguration'

const DEFAULT_LOGS_INIT: LogsInitConfiguration = {
  clientToken: 'xxx',
  site: 'datadoghq.com',
  remoteConfiguration: { id: 'test-id' },
}

describe('applyLogsRemoteConfiguration', () => {
  it('should apply forwardErrorsToLogs when present', () => {
    const result = applyLogsRemoteConfiguration(DEFAULT_LOGS_INIT, {
      logs: { forwardErrorsToLogs: false },
    })
    expect(result.forwardErrorsToLogs).toBeFalse()
  })

  it('should apply forwardConsoleLogs when present', () => {
    const result = applyLogsRemoteConfiguration(DEFAULT_LOGS_INIT, {
      logs: { forwardConsoleLogs: ['warn', 'error'] },
    })
    expect(result.forwardConsoleLogs).toEqual(['warn', 'error'])
  })

  it('should apply forwardReports when present', () => {
    const result = applyLogsRemoteConfiguration(DEFAULT_LOGS_INIT, {
      logs: { forwardReports: 'all' },
    })
    expect(result.forwardReports).toBe('all')
  })

  it('should not overwrite fields absent from the remote config', () => {
    const initWithReports: LogsInitConfiguration = {
      clientToken: 'xxx',
      forwardReports: ['deprecation'],
    }
    const result = applyLogsRemoteConfiguration(initWithReports, { logs: {} })
    expect(result.forwardReports).toEqual(['deprecation'])
  })

  it('should skip logs fields when the logs section is absent', () => {
    const initWithErrors: LogsInitConfiguration = {
      clientToken: 'xxx',
      forwardErrorsToLogs: true,
    }
    const result = applyLogsRemoteConfiguration(initWithErrors, { profiling: { sampleRate: 10 } })
    expect(result.forwardErrorsToLogs).toBe(true)
  })
})

describe('getLogsRemoteConfiguration', () => {
  const RC_ID = 'test-id'
  const initConfiguration: LogsInitConfiguration = {
    clientToken: 'xxx',
    site: 'datadoghq.com',
    remoteConfiguration: { id: RC_ID },
  }

  beforeEach(() => {
    // Prevent background sync from firing so localStorage state stays predictable across tests
    // Return a never-resolving Promise so the background sync .then() never fires,
    // preventing display.error or cache.write from being called after test cleanup.
    replaceMockableWithSpy(fetchRemoteConfiguration).and.returnValue(new Promise((_resolve) => undefined))
    registerCleanupTask(() => localStorage.removeItem(buildCacheKey(RC_ID)))
  })

  it('returns the initConfiguration with remote overrides applied on cache hit', () => {
    localStorage.setItem(
      buildCacheKey(RC_ID),
      JSON.stringify({
        version: CACHE_VERSION,
        config: { logs: { forwardErrorsToLogs: false } },
        fetchedAt: Date.now(),
      })
    )

    const result = getLogsRemoteConfiguration(initConfiguration)
    expect(result!.forwardErrorsToLogs).toBeFalse()
  })

  it('returns the initConfiguration unchanged on cache miss when not required', () => {
    const result = getLogsRemoteConfiguration(initConfiguration)
    expect(result).toEqual(initConfiguration)
  })

  it('returns undefined on cache miss when required', () => {
    const requiredInit: LogsInitConfiguration = {
      ...initConfiguration,
      remoteConfiguration: { id: RC_ID, required: true },
    }
    const result = getLogsRemoteConfiguration(requiredInit)
    expect(result).toBeUndefined()
  })
})

describe('fetchAndApplyLogsRemoteConfiguration', () => {
  let interceptor: ReturnType<typeof interceptRequests>

  beforeEach(() => {
    interceptor = interceptRequests()
  })

  it('returns the init configuration with overrides applied on success', async () => {
    interceptor.withFetch(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ logs: { forwardErrorsToLogs: false } }),
      })
    )

    const result = await fetchAndApplyLogsRemoteConfiguration(DEFAULT_LOGS_INIT)
    expect(result!.forwardErrorsToLogs).toBeFalse()
  })

  it('returns undefined and displays an error when the fetch fails', async () => {
    spyOn(display, 'error')
    interceptor.withFetch(() => Promise.resolve({ ok: false, status: 500 }))

    const result = await fetchAndApplyLogsRemoteConfiguration(DEFAULT_LOGS_INIT)
    expect(result).toBeUndefined()
    expect(display.error).toHaveBeenCalled()
  })
})
