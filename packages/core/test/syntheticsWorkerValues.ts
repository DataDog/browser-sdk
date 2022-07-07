import { deleteCookie, setCookie } from '../src/browser/cookie'
import type { BrowserWindow } from '../src/domain/synthetics/syntheticsWorkerValues'
import {
  SYNTHETICS_INJECTS_RUM_COOKIE_NAME,
  SYNTHETICS_RESULT_ID_COOKIE_NAME,
  SYNTHETICS_TEST_ID_COOKIE_NAME,
} from '../src/domain/synthetics/syntheticsWorkerValues'
import { ONE_MINUTE } from '../src/tools/utils'

// Duration to create a cookie lasting at least until the end of the test
const COOKIE_DURATION = ONE_MINUTE

export function mockSyntheticsWorkerValues(
  { publicId, resultId, injectsRum }: { publicId?: any; resultId?: any; injectsRum?: any } = {
    publicId: 'synthetics_public_id',
    resultId: 'synthetics_result_id',
    injectsRum: false,
  },
  method: 'globals' | 'cookies' = 'globals'
) {
  switch (method) {
    case 'globals':
      ;(window as BrowserWindow)._DATADOG_SYNTHETICS_PUBLIC_ID = publicId
      ;(window as BrowserWindow)._DATADOG_SYNTHETICS_RESULT_ID = resultId
      ;(window as BrowserWindow)._DATADOG_SYNTHETICS_INJECTS_RUM = injectsRum
      break
    case 'cookies':
      if (publicId !== undefined) {
        setCookie(SYNTHETICS_TEST_ID_COOKIE_NAME, publicId, COOKIE_DURATION)
      }
      if (resultId !== undefined) {
        setCookie(SYNTHETICS_RESULT_ID_COOKIE_NAME, resultId, COOKIE_DURATION)
      }
      if (injectsRum !== undefined) {
        setCookie(SYNTHETICS_INJECTS_RUM_COOKIE_NAME, injectsRum, COOKIE_DURATION)
      }
      break
  }
}

export function cleanupSyntheticsWorkerValues() {
  delete (window as BrowserWindow)._DATADOG_SYNTHETICS_PUBLIC_ID
  delete (window as BrowserWindow)._DATADOG_SYNTHETICS_RESULT_ID
  delete (window as BrowserWindow)._DATADOG_SYNTHETICS_INJECTS_RUM
  deleteCookie(SYNTHETICS_TEST_ID_COOKIE_NAME)
  deleteCookie(SYNTHETICS_RESULT_ID_COOKIE_NAME)
  deleteCookie(SYNTHETICS_INJECTS_RUM_COOKIE_NAME)
}
