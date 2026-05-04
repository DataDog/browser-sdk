import { vi, beforeEach, describe, expect, it, type Mock } from 'vitest'
import type { InitConfiguration } from '@datadog/browser-core'
import { display } from '@datadog/browser-core'
import {
  EXHAUSTIVE_INIT_CONFIGURATION,
  type CamelToSnakeCase,
  type ExtractTelemetryConfiguration,
  type MapInitConfigurationKey,
  SERIALIZED_EXHAUSTIVE_INIT_CONFIGURATION,
} from '../../../core/test'
import type { LogsInitConfiguration } from './configuration'
import {
  serializeLogsConfiguration,
  validateAndBuildForwardOption,
  validateAndBuildLogsConfiguration,
} from './configuration'

const DEFAULT_INIT_CONFIGURATION = { clientToken: 'xxx' }

describe('validateAndBuildLogsConfiguration', () => {
  describe('forwardErrorsToLogs', () => {
    it('defaults to true if the option is not provided', () => {
      expect(validateAndBuildLogsConfiguration(DEFAULT_INIT_CONFIGURATION)!.forwardErrorsToLogs).toBe(true)
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildLogsConfiguration({ ...DEFAULT_INIT_CONFIGURATION, forwardErrorsToLogs: true })!
          .forwardErrorsToLogs
      ).toBe(true)
      expect(
        validateAndBuildLogsConfiguration({ ...DEFAULT_INIT_CONFIGURATION, forwardErrorsToLogs: false })!
          .forwardErrorsToLogs
      ).toBe(false)
    })

    it('the provided value is cast to boolean', () => {
      expect(
        validateAndBuildLogsConfiguration({ ...DEFAULT_INIT_CONFIGURATION, forwardErrorsToLogs: 'foo' as any })!
          .forwardErrorsToLogs
      ).toBe(true)
    })

    it('is set to true for falsy values other than `false`', () => {
      expect(
        validateAndBuildLogsConfiguration({ ...DEFAULT_INIT_CONFIGURATION, forwardErrorsToLogs: null as any })!
          .forwardErrorsToLogs
      ).toBe(true)
      expect(
        validateAndBuildLogsConfiguration({ ...DEFAULT_INIT_CONFIGURATION, forwardErrorsToLogs: '' as any })!
          .forwardErrorsToLogs
      ).toBe(true)
      expect(
        validateAndBuildLogsConfiguration({ ...DEFAULT_INIT_CONFIGURATION, forwardErrorsToLogs: 0 as any })!
          .forwardErrorsToLogs
      ).toBe(true)
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

  describe('PCI compliant intake option', () => {
    let warnSpy: Mock<typeof display.warn>

    beforeEach(() => {
      warnSpy = vi.spyOn(display, 'warn')
    })
    it('should display warning with wrong PCI intake configuration', () => {
      validateAndBuildLogsConfiguration({
        ...DEFAULT_INIT_CONFIGURATION,
        site: 'us3.datadoghq.com',
        usePciIntake: true,
      })
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy).toHaveBeenCalledWith(
        'PCI compliance for Logs is only available for Datadog organizations in the US1 site. Default intake will be used.'
      )
    })
  })
})

describe('validateAndBuildForwardOption', () => {
  let displaySpy: Mock<typeof display.error>
  const allowedValues = ['foo', 'bar']
  const label = 'Label'
  const errorMessage = 'Label should be "all" or an array with allowed values "foo", "bar"'

  beforeEach(() => {
    displaySpy = vi.spyOn(display, 'error')
  })

  it('does not validate the configuration if an incorrect string is provided', () => {
    validateAndBuildForwardOption('foo' as any, allowedValues, label)

    expect(displaySpy).toHaveBeenCalledTimes(1)
    expect(displaySpy).toHaveBeenCalledWith(errorMessage)
  })

  it('does not validate the configuration if an incorrect api is provided', () => {
    validateAndBuildForwardOption(['dir'], allowedValues, label)

    expect(displaySpy).toHaveBeenCalledTimes(1)
    expect(displaySpy).toHaveBeenCalledWith(errorMessage)
  })

  it('defaults to an empty array', () => {
    expect(validateAndBuildForwardOption(undefined, allowedValues, label)).toEqual([])
  })

  it('is set to provided value', () => {
    expect(validateAndBuildForwardOption(['foo'], allowedValues, label)).toEqual(['foo'])
  })

  it('contains all options when "all" is provided', () => {
    expect(validateAndBuildForwardOption('all', allowedValues, label)).toEqual(allowedValues)
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
      usePciIntake: false,
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
      use_pci_intake: false,
    })
  })
})
