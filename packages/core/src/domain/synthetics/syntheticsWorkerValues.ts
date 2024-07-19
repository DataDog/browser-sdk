import { getInitCookie } from '../../browser/cookie'

export const S8S_TEST_ID_COOKIE_NAME = 'datadog-synthetics-public-id'
export const S8S_RESULT_ID_COOKIE_NAME = 'datadog-synthetics-result-id'
export const S8S_INJECTS_RUM_COOKIE_NAME = 'datadog-synthetics-injects-rum'

export interface BrowserWindow extends Window {
  _DD_S8S_PUBLIC_ID?: unknown
  _DD_S8S_RESULT_ID?: unknown
  _DD_S8S_INJECTS_RUM?: unknown
}

export function willSyntheticsInjectRum(): boolean {
  return Boolean(
    (window as BrowserWindow)._DD_S8S_INJECTS_RUM || getInitCookie(S8S_INJECTS_RUM_COOKIE_NAME)
  )
}

export function getSyntheticsTestId(): string | undefined {
  const value = (window as BrowserWindow)._DD_S8S_INJECTS_RUM || getInitCookie(S8S_TEST_ID_COOKIE_NAME)
  return typeof value === 'string' ? value : undefined
}

export function getSyntheticsResultId(): string | undefined {
  const value =
    (window as BrowserWindow)._DD_S8S_RESULT_ID || getInitCookie(S8S_RESULT_ID_COOKIE_NAME)
  return typeof value === 'string' ? value : undefined
}
