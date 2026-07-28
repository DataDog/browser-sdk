import type { InitConfiguration } from '@datadog/browser-core'
import {
  EXHAUSTIVE_INIT_CONFIGURATION,
  type CamelToSnakeCase,
  type ExtractTelemetryConfiguration,
  type MapInitConfigurationKey,
  SERIALIZED_EXHAUSTIVE_INIT_CONFIGURATION,
} from '../../../browser-core/test'
import type { LogsInitConfiguration } from './configuration'
import { serializeLogsConfiguration, validateAndBuildLogsConfiguration } from './configuration'

const DEFAULT_INIT_CONFIGURATION = { clientToken: 'xxx' }

describe('validateAndBuildLogsConfiguration', () => {
  describe('forwardErrorsToLogs', () => {
    it('defaults to true if the option is not provided', () => {
      expect(validateAndBuildLogsConfiguration(DEFAULT_INIT_CONFIGURATION)!.forwardErrorsToLogs).toBeTrue()
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildLogsConfiguration({ ...DEFAULT_INIT_CONFIGURATION, forwardErrorsToLogs: true })!
          .forwardErrorsToLogs
      ).toBeTrue()
      expect(
        validateAndBuildLogsConfiguration({ ...DEFAULT_INIT_CONFIGURATION, forwardErrorsToLogs: false })!
          .forwardErrorsToLogs
      ).toBeFalse()
    })

    it('the provided value is cast to boolean', () => {
      expect(
        validateAndBuildLogsConfiguration({ ...DEFAULT_INIT_CONFIGURATION, forwardErrorsToLogs: 'foo' as any })!
          .forwardErrorsToLogs
      ).toBeTrue()
    })

    it('defaults to true when null is provided', () => {
      expect(
        validateAndBuildLogsConfiguration({ ...DEFAULT_INIT_CONFIGURATION, forwardErrorsToLogs: null as any })!
          .forwardErrorsToLogs
      ).toBeTrue()
    })
  })

  describe('forwardConsoleLogs', () => {
    it('does not contain "error" when forwardConsoleLogs is disabled and forwardErrorsToLogs is explicitly enabled', () => {
      expect(
        validateAndBuildLogsConfiguration({ ...DEFAULT_INIT_CONFIGURATION, forwardErrorsToLogs: true })!
          .forwardConsoleLogs
      ).not.toContain('error')
    })

    it('does not contain "error" when forwardConsoleLogs is disabled and forwardErrorsToLogs is omitted', () => {
      expect(validateAndBuildLogsConfiguration({ ...DEFAULT_INIT_CONFIGURATION })!.forwardConsoleLogs).not.toContain(
        'error'
      )
    })

    it('contains "error" when forwardConsoleLogs contains "error"', () => {
      expect(
        validateAndBuildLogsConfiguration({
          ...DEFAULT_INIT_CONFIGURATION,
          forwardConsoleLogs: ['error'],
        })!.forwardConsoleLogs
      ).toEqual(['error'])
    })
  })
})

describe('serializeLogsConfiguration', () => {
  it('should serialize the configuration', () => {
    const exhaustiveLogsInitConfiguration: Required<LogsInitConfiguration> = {
      ...EXHAUSTIVE_INIT_CONFIGURATION,
      beforeSend: () => true,
      forwardErrorsToLogs: true,
      forwardConsoleLogs: 'all',
      forwardReports: 'all',
    }

    type MapLogsInitConfigurationKey<Key extends string> = Key extends keyof InitConfiguration
      ? MapInitConfigurationKey<Key>
      : CamelToSnakeCase<Key>

    // By specifying the type here, we can ensure that serializeConfiguration is returning an
    // object containing all expected properties.
    const serializedConfiguration: ExtractTelemetryConfiguration<
      MapLogsInitConfigurationKey<keyof LogsInitConfiguration>
    > = serializeLogsConfiguration(exhaustiveLogsInitConfiguration)

    expect(serializedConfiguration).toEqual({
      ...SERIALIZED_EXHAUSTIVE_INIT_CONFIGURATION,
      forward_errors_to_logs: true,
      forward_console_logs: 'all',
      forward_reports: 'all',
    })
  })
})
