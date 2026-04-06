import { logsExtension, ALL_CONSOLE_APIS, ALL_REPORT_TYPES } from './configuration'

describe('logsExtension.validate', () => {
  it('returns valid config with defaults when empty object provided', () => {
    const result = logsExtension.validate({})
    expect(result).not.toBeNull()
  })

  it('returns forwardErrorsToLogs: true by default', () => {
    const result = logsExtension.validate({})
    expect(result!.forwardErrorsToLogs).toBe(true)
  })

  it('returns empty forwardConsoleLogs by default', () => {
    const result = logsExtension.validate({})
    expect(result!.forwardConsoleLogs).toEqual([])
  })

  it('returns empty forwardReports by default', () => {
    const result = logsExtension.validate({})
    expect(result!.forwardReports).toEqual([])
  })

  it("expands 'all' for forwardConsoleLogs to all console APIs", () => {
    const result = logsExtension.validate({ forwardConsoleLogs: 'all' })
    expect(result!.forwardConsoleLogs).toEqual(ALL_CONSOLE_APIS)
  })

  it("expands 'all' for forwardReports to all report types", () => {
    const result = logsExtension.validate({ forwardReports: 'all' })
    expect(result!.forwardReports).toEqual(ALL_REPORT_TYPES)
  })

  it('passes through specific forwardConsoleLogs array', () => {
    const result = logsExtension.validate({ forwardConsoleLogs: ['warn', 'error'] })
    expect(result!.forwardConsoleLogs).toEqual(['warn', 'error'])
  })

  it('returns null for invalid forwardConsoleLogs values', () => {
    const spy = spyOn(console, 'warn')
    const result = logsExtension.validate({ forwardConsoleLogs: ['invalid' as any] })
    expect(result).toBeNull()
    expect(spy).toHaveBeenCalledWith('Invalid forwardConsoleLogs value')
  })

  it('returns null when init is undefined', () => {
    const result = logsExtension.validate(undefined)
    expect(result).toBeNull()
  })

  it('passes through beforeSend callback', () => {
    const beforeSend = () => true
    const result = logsExtension.validate({ beforeSend })
    expect(result!.beforeSend).toBe(beforeSend)
  })

  it('respects forwardErrorsToLogs: false', () => {
    const result = logsExtension.validate({ forwardErrorsToLogs: false })
    expect(result!.forwardErrorsToLogs).toBe(false)
  })
})
