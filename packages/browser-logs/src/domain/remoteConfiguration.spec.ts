import type { LogsInitConfiguration } from './configuration'
import { applyLogsRemoteConfiguration } from './remoteConfiguration'

const DEFAULT_LOGS_INIT: LogsInitConfiguration = {
  clientToken: 'xxx',
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
