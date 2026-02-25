import { getInitCookie } from '../../browser/cookie'
import { globalObject, isWorkerEnvironment } from '../../tools/globalObject'
import { tryJsonParse } from '../../tools/utils/objectUtils'

const cookieNamePrefix = 'datadog-synthetics-'
export const SYNTHETICS_TEST_ID_COOKIE_NAME = `${cookieNamePrefix}public-id`
export const SYNTHETICS_RESULT_ID_COOKIE_NAME = `${cookieNamePrefix}result-id`
export const SYNTHETICS_INJECTS_RUM_COOKIE_NAME = `${cookieNamePrefix}injects-rum`
export const SYNTHETICS_CONTEXT_COOKIE_NAME = `${cookieNamePrefix}rum-context`

export interface BrowserWindow extends Window {
  _DATADOG_SYNTHETICS_PUBLIC_ID?: unknown
  _DATADOG_SYNTHETICS_RESULT_ID?: unknown
  _DATADOG_SYNTHETICS_INJECTS_RUM?: unknown
  _DATADOG_SYNTHETICS_RUM_CONTEXT?: unknown
}

export interface SyntheticsContext {
  test_id: string
  result_id: string
  [key: string]: unknown
}

export function willSyntheticsInjectRum(): boolean {
  if (isWorkerEnvironment) {
    // We don't expect to run synthetics tests in a worker environment
    return false
  }

  return Boolean(
    (globalObject as BrowserWindow)._DATADOG_SYNTHETICS_INJECTS_RUM || getInitCookie(SYNTHETICS_INJECTS_RUM_COOKIE_NAME)
  )
}

export function getSyntheticsContext(): SyntheticsContext | undefined {
  const raw = getRawSyntheticsContext()
  return isValidSyntheticsContext(raw) ? raw : undefined
}

export function isSyntheticsTest(): boolean {
  return Boolean(getSyntheticsContext())
}

function getRawSyntheticsContext(): unknown {
  const rawGlobal = (globalObject as BrowserWindow)._DATADOG_SYNTHETICS_RUM_CONTEXT
  if (rawGlobal) {
    return rawGlobal
  }

  const rawCookie = getInitCookie(SYNTHETICS_CONTEXT_COOKIE_NAME)
  if (rawCookie) {
    return tryJsonParse(decodeURIComponent(rawCookie))
  }

  return {
    test_id: (window as BrowserWindow)._DATADOG_SYNTHETICS_PUBLIC_ID || getInitCookie(SYNTHETICS_TEST_ID_COOKIE_NAME),
    result_id:
      (window as BrowserWindow)._DATADOG_SYNTHETICS_RESULT_ID || getInitCookie(SYNTHETICS_RESULT_ID_COOKIE_NAME),
  }
}

function isValidSyntheticsContext(value: unknown): value is SyntheticsContext {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).test_id === 'string' &&
    typeof (value as Record<string, unknown>).result_id === 'string'
  )
}
