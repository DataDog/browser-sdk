import { getInitCookie } from '../../browser/cookie'
import { getGlobalObject } from '../../tools/getGlobalObject'

export const SYNTHETICS_TEST_ID_COOKIE_NAME = 'datadog-synthetics-public-id'
export const SYNTHETICS_RESULT_ID_COOKIE_NAME = 'datadog-synthetics-result-id'
export const SYNTHETICS_INJECTS_RUM_COOKIE_NAME = 'datadog-synthetics-injects-rum'

export interface GlobalWithSynthetics {
  _DATADOG_SYNTHETICS_PUBLIC_ID?: unknown
  _DATADOG_SYNTHETICS_RESULT_ID?: unknown
  _DATADOG_SYNTHETICS_INJECTS_RUM?: unknown
}

export function willSyntheticsInjectRum(): boolean {
  const isServiceWorker = typeof self !== 'undefined' && 'ServiceWorkerGlobalScope' in self
  if (isServiceWorker) {
    return false
  }
  
  const globalObject = getGlobalObject<GlobalWithSynthetics>()
  
  try {
    return Boolean(
      globalObject._DATADOG_SYNTHETICS_INJECTS_RUM || getInitCookie(SYNTHETICS_INJECTS_RUM_COOKIE_NAME)
    )
  } catch (e) {
    return false
  }
}

export function getSyntheticsTestId(): string | undefined {
  const globalObject = getGlobalObject<GlobalWithSynthetics>()
  
  try {
    const value = globalObject._DATADOG_SYNTHETICS_PUBLIC_ID || getInitCookie(SYNTHETICS_TEST_ID_COOKIE_NAME)
    return typeof value === 'string' ? value : undefined
  } catch (e) {
    return undefined
  }
}

export function getSyntheticsResultId(): string | undefined {
  const globalObject = getGlobalObject<GlobalWithSynthetics>()
  
  try {
    const value =
      globalObject._DATADOG_SYNTHETICS_RESULT_ID || getInitCookie(SYNTHETICS_RESULT_ID_COOKIE_NAME)
    return typeof value === 'string' ? value : undefined
  } catch (e) {
    return undefined
  }
}
