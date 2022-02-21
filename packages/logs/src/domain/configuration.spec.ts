import { ConsoleApiName, display, resetExperimentalFeatures, updateExperimentalFeatures } from '@datadog/browser-core'
import { validateAndBuildLogsConfiguration } from './configuration'

const DEFAULT_INIT_CONFIGURATION = { clientToken: 'xxx' }

describe('validateAndBuildLogsConfiguration', () => {
  describe('forwardErrorsToLogs', () => {
    it('defaults to false if the option is not provided', () => {
      expect(validateAndBuildLogsConfiguration(DEFAULT_INIT_CONFIGURATION)!.forwardErrorsToLogs).toBeFalse()
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildLogsConfiguration({ ...DEFAULT_INIT_CONFIGURATION, forwardErrorsToLogs: true })!
          .forwardErrorsToLogs
      ).toBeTrue()
    })

    it('the provided value is cast to boolean', () => {
      expect(
        validateAndBuildLogsConfiguration({ ...DEFAULT_INIT_CONFIGURATION, forwardErrorsToLogs: 'foo' as any })!
          .forwardErrorsToLogs
      ).toBeTrue()
    })
  })

  describe('forwardConsoleLogs if ff forward-logs enabled', () => {
    let displaySpy: jasmine.Spy<typeof display.error>
    const errorMessage =
      'Forward Console Logs should be "all" or an array with allowed values "log", "debug", "info", "warn", "error"'

    beforeEach(() => {
      displaySpy = spyOn(display, 'error')
      updateExperimentalFeatures(['forward-logs'])
    })

    afterEach(() => {
      resetExperimentalFeatures()
    })

    it('does not validate the configuration if an incorrect string is provided', () => {
      validateAndBuildLogsConfiguration({ ...DEFAULT_INIT_CONFIGURATION, forwardConsoleLogs: 'foo' as any })

      expect(displaySpy).toHaveBeenCalledOnceWith(errorMessage)
    })

    it('does not validate the configuration if an incorrect api is provided', () => {
      validateAndBuildLogsConfiguration({ ...DEFAULT_INIT_CONFIGURATION, forwardConsoleLogs: ['dir'] as any })

      expect(displaySpy).toHaveBeenCalledOnceWith(errorMessage)
    })

    it('defaults to an empty array', () => {
      expect(validateAndBuildLogsConfiguration(DEFAULT_INIT_CONFIGURATION)!.forwardConsoleLogs).toEqual([])
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildLogsConfiguration({ ...DEFAULT_INIT_CONFIGURATION, forwardConsoleLogs: ['log'] })!
          .forwardConsoleLogs
      ).toEqual(['log'])
    })

    it('contains "error" when forwardErrorsToLogs is enabled', () => {
      expect(
        validateAndBuildLogsConfiguration({ ...DEFAULT_INIT_CONFIGURATION, forwardErrorsToLogs: true })!
          .forwardConsoleLogs
      ).toEqual(['error'])
    })

    it('contains all apis when forwardConsoleLogs is set to "all"', () => {
      expect(
        validateAndBuildLogsConfiguration({ ...DEFAULT_INIT_CONFIGURATION, forwardConsoleLogs: 'all' })!
          .forwardConsoleLogs
      ).toEqual(Object.keys(ConsoleApiName) as ConsoleApiName[])
    })

    it('contains "error" once when both forwardErrorsToLogs and forwardConsoleLogs are enabled', () => {
      expect(
        validateAndBuildLogsConfiguration({
          ...DEFAULT_INIT_CONFIGURATION,
          forwardConsoleLogs: ['error'],
          forwardErrorsToLogs: true,
        })!.forwardConsoleLogs
      ).toEqual(['error'])
    })
  })

  describe('forwardConsoleLogs if ff forward-logs disabled', () => {
    it('should be set to empty array', () => {
      expect(
        validateAndBuildLogsConfiguration({ ...DEFAULT_INIT_CONFIGURATION, forwardConsoleLogs: ['log'] })!
          .forwardConsoleLogs
      ).toEqual([])
    })

    it('contains "error" when forwardErrorsToLogs is enabled', () => {
      expect(
        validateAndBuildLogsConfiguration({ ...DEFAULT_INIT_CONFIGURATION, forwardErrorsToLogs: true })!
          .forwardConsoleLogs
      ).toEqual(['error'])
    })
  })
})
