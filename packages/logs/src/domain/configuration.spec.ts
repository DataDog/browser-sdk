import { display, resetExperimentalFeatures, updateExperimentalFeatures } from '@datadog/browser-core'
import { validateAndBuildForwardOption, validateAndBuildLogsConfiguration } from './configuration'

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

  describe('forwardConsoleLogs', () => {
    it('contains "error" when forwardErrorsToLogs is enabled', () => {
      expect(
        validateAndBuildLogsConfiguration({ ...DEFAULT_INIT_CONFIGURATION, forwardErrorsToLogs: true })!
          .forwardConsoleLogs
      ).toEqual(['error'])
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
})

describe('validateAndBuildForwardOption', () => {
  let displaySpy: jasmine.Spy<typeof display.error>
  const allowedValues = ['foo', 'bar']
  const label = 'Label'
  const ff = 'flag'
  const errorMessage = 'Label should be "all" or an array with allowed values "foo", "bar"'

  describe('if ff enabled', () => {
    beforeEach(() => {
      displaySpy = spyOn(display, 'error')
      updateExperimentalFeatures([ff])
    })

    afterEach(() => {
      resetExperimentalFeatures()
    })

    it('does not validate the configuration if an incorrect string is provided', () => {
      validateAndBuildForwardOption('foo' as any, allowedValues, label, ff)

      expect(displaySpy).toHaveBeenCalledOnceWith(errorMessage)
    })

    it('does not validate the configuration if an incorrect api is provided', () => {
      validateAndBuildForwardOption(['dir'], allowedValues, label, ff)

      expect(displaySpy).toHaveBeenCalledOnceWith(errorMessage)
    })

    it('defaults to an empty array', () => {
      expect(validateAndBuildForwardOption(undefined, allowedValues, label, ff)).toEqual([])
    })

    it('is set to provided value', () => {
      expect(validateAndBuildForwardOption(['foo'], allowedValues, label, ff)).toEqual(['foo'])
    })

    it('contains all options when "all" is provided', () => {
      expect(validateAndBuildForwardOption('all', allowedValues, label, ff)).toEqual(allowedValues)
    })
  })

  describe('if ff disabled', () => {
    it('should be set to empty array', () => {
      expect(validateAndBuildForwardOption(['log'], allowedValues, label, ff)).toEqual([])
    })
  })
})
