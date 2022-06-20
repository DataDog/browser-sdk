import { getCookie } from '@datadog/browser-core'

export const SYNTHETICS_TEST_ID_COOKIE_NAME = 'datadog-synthetics-public-id'
export const SYNTHETICS_RESULT_ID_COOKIE_NAME = 'datadog-synthetics-result-id'
export const SYNTHETICS_INJECTS_RUM_COOKIE_NAME = 'datadog-synthetics-injects-rum'

export interface BrowserWindow extends Window {
  _DATADOG_SYNTHETICS_PUBLIC_ID?: string
  _DATADOG_SYNTHETICS_RESULT_ID?: string
  _DATADOG_SYNTHETICS_INJECTS_RUM?: boolean
}

export function getSyntheticsContext() {
  const testId = (window as BrowserWindow)._DATADOG_SYNTHETICS_PUBLIC_ID || getCookie(SYNTHETICS_TEST_ID_COOKIE_NAME)
  const resultId =
    (window as BrowserWindow)._DATADOG_SYNTHETICS_RESULT_ID || getCookie(SYNTHETICS_RESULT_ID_COOKIE_NAME)

  if (typeof testId === 'string' && typeof resultId === 'string') {
    return {
      test_id: testId,
      result_id: resultId,
      injected: willSyntheticsInjectRum(),
    }
  }
}

export function willSyntheticsInjectRum() {
  return Boolean(
    (window as BrowserWindow)._DATADOG_SYNTHETICS_INJECTS_RUM || getCookie(SYNTHETICS_INJECTS_RUM_COOKIE_NAME)
  )
}
