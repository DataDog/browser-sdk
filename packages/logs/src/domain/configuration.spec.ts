import { display, resetExperimentalFeatures, updateExperimentalFeatures } from '@datadog/browser-core'
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

  describe('forwardConsoleLogs  if ff forward-logs enabled', () => {
    let displaySpy: jasmine.Spy<typeof display.error>

    beforeEach(() => {
      displaySpy = spyOn(display, 'error')
      updateExperimentalFeatures(['forward-logs'])
    })

    afterEach(() => {
      resetExperimentalFeatures()
    })

    it('does not validate the configuration if an incorrect value is provided', () => {
      validateAndBuildLogsConfiguration({ ...DEFAULT_INIT_CONFIGURATION, forwardConsoleLogs: 'foo' as any })

      expect(displaySpy).toHaveBeenCalledOnceWith('Forward Console Logs should be an array')
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

    it('add error console when forwardErrorsToLogs is enabled', () => {
      expect(
        validateAndBuildLogsConfiguration({ ...DEFAULT_INIT_CONFIGURATION, forwardErrorsToLogs: true })!
          .forwardConsoleLogs
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

    it('add error console when forwardErrorsToLogs is enabled', () => {
      expect(
        validateAndBuildLogsConfiguration({ ...DEFAULT_INIT_CONFIGURATION, forwardErrorsToLogs: true })!
          .forwardConsoleLogs
      ).toEqual(['error'])
    })
  })
})
