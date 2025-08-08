import type { Configuration } from '@datadog/browser-core'
import { objectValues, removeDuplicates, display, ConsoleApiName, RawReportType } from '@datadog/browser-core'

/**
 * Base configuration interface for logs core functionality
 * Contains only the configuration properties needed by core collection logic
 */
export interface LogsConfiguration extends Configuration {
  forwardConsoleLogs: ConsoleApiName[]
  forwardErrorsToLogs: boolean
  forwardReports: RawReportType[]
  requestErrorResponseLengthLimit: number
}

/**
 * Helper function to validate and resolve forward options ('all' or array)
 */
export function validateAndBuildForwardOption<T>(
  option: readonly T[] | 'all' | undefined,
  allowedValues: T[],
  label: string
): T[] | undefined {
  if (option === undefined) {
    return []
  }

  if (!(option === 'all' || (Array.isArray(option) && option.every((api) => allowedValues.includes(api))))) {
    display.error(`${label} should be "all" or an array with allowed values "${allowedValues.join('", "')}"`)
    return
  }

  return option === 'all' ? allowedValues : removeDuplicates<T>(option)
}

/**
 * Resolve console logs configuration
 */
export function resolveForwardConsoleLogs(value: ConsoleApiName[] | 'all' | undefined): ConsoleApiName[] {
  return validateAndBuildForwardOption(value, objectValues(ConsoleApiName), 'Forward Console Logs') || []
}

/**
 * Resolve reports configuration
 */
export function resolveForwardReports(value: RawReportType[] | 'all' | undefined): RawReportType[] {
  return validateAndBuildForwardOption(value, objectValues(RawReportType), 'Forward Reports') || []
}
