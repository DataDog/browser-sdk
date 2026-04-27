import { ONE_MINUTE } from '../../src/tools/utils/timeUtils'
import { deleteCookie, resetInitCookies, setCookie } from '../../src/browser/cookie'
import type { BrowserWindow, SyntheticsContext } from '../../src/domain/synthetics/syntheticsWorkerValues'
import {
  SYNTHETICS_INJECTS_RUM_COOKIE_NAME,
  SYNTHETICS_CONTEXT_COOKIE_NAME,
  SYNTHETICS_TEST_ID_COOKIE_NAME,
  SYNTHETICS_RESULT_ID_COOKIE_NAME,
} from '../../src/domain/synthetics/syntheticsWorkerValues'
import { registerCleanupTask } from '../registerCleanupTask'

// Duration to create a cookie lasting at least until the end of the test
const COOKIE_DURATION = ONE_MINUTE

export function mockSyntheticsWorkerValues(
  {
    injectsRum,
    context,
    publicId,
    resultId,
  }: {
    injectsRum?: any
    context?: SyntheticsContext
    publicId?: any
    resultId?: any
  } = {
    context: { test_id: 'synthetics_public_id', result_id: 'synthetics_result_id' },
    injectsRum: false,
  },
  method: 'globals' | 'cookies' = 'globals'
) {
  switch (method) {
    case 'globals':
      ;(window as BrowserWindow)._DATADOG_SYNTHETICS_INJECTS_RUM = injectsRum
      ;(window as BrowserWindow)._DATADOG_SYNTHETICS_RUM_CONTEXT = context
      ;(window as BrowserWindow)._DATADOG_SYNTHETICS_PUBLIC_ID = publicId
      ;(window as BrowserWindow)._DATADOG_SYNTHETICS_RESULT_ID = resultId
      break
    case 'cookies':
      if (injectsRum !== undefined) {
        setCookie(SYNTHETICS_INJECTS_RUM_COOKIE_NAME, injectsRum, COOKIE_DURATION)
      }
      if (context !== undefined) {
        setCookie(SYNTHETICS_CONTEXT_COOKIE_NAME, encodeURIComponent(JSON.stringify(context)), COOKIE_DURATION)
      }
      if (publicId !== undefined) {
        setCookie(SYNTHETICS_TEST_ID_COOKIE_NAME, publicId, COOKIE_DURATION)
      }
      if (resultId !== undefined) {
        setCookie(SYNTHETICS_RESULT_ID_COOKIE_NAME, resultId, COOKIE_DURATION)
      }
      break
  }
  resetInitCookies()

  registerCleanupTask(() => {
    delete (window as BrowserWindow)._DATADOG_SYNTHETICS_INJECTS_RUM
    delete (window as BrowserWindow)._DATADOG_SYNTHETICS_RUM_CONTEXT
    delete (window as BrowserWindow)._DATADOG_SYNTHETICS_PUBLIC_ID
    delete (window as BrowserWindow)._DATADOG_SYNTHETICS_RESULT_ID
    deleteCookie(SYNTHETICS_INJECTS_RUM_COOKIE_NAME)
    deleteCookie(SYNTHETICS_CONTEXT_COOKIE_NAME)
    deleteCookie(SYNTHETICS_TEST_ID_COOKIE_NAME)
    deleteCookie(SYNTHETICS_RESULT_ID_COOKIE_NAME)
    resetInitCookies()
  })
}
