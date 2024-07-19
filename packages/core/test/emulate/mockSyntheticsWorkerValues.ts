import { ONE_MINUTE } from '../../src/tools/utils/timeUtils'
import { deleteCookie, resetInitCookies, setCookie } from '../../src/browser/cookie'
import type { BrowserWindow } from '../../src/domain/synthetics/syntheticsWorkerValues'
import {
  S8S_INJECTS_RUM_COOKIE_NAME,
  S8S_RESULT_ID_COOKIE_NAME,
  S8S_TEST_ID_COOKIE_NAME,
} from '../../src/domain/synthetics/syntheticsWorkerValues'

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
      ;(window as BrowserWindow)._DD_S8S_PUBLIC_ID = publicId
      ;(window as BrowserWindow)._DD_S8S_RESULT_ID = resultId
      ;(window as BrowserWindow)._DD_S8S_INJECTS_RUM = injectsRum
      break
    case 'cookies':
      if (publicId !== undefined) {
        setCookie(S8S_TEST_ID_COOKIE_NAME, publicId, COOKIE_DURATION)
      }
      if (resultId !== undefined) {
        setCookie(S8S_RESULT_ID_COOKIE_NAME, resultId, COOKIE_DURATION)
      }
      if (injectsRum !== undefined) {
        setCookie(S8S_INJECTS_RUM_COOKIE_NAME, injectsRum, COOKIE_DURATION)
      }
      break
  }
  resetInitCookies()
}

export function cleanupSyntheticsWorkerValues() {
  delete (window as BrowserWindow)._DD_S8S_PUBLIC_ID
  delete (window as BrowserWindow)._DD_S8S_RESULT_ID
  delete (window as BrowserWindow)._DD_S8S_INJECTS_RUM
  deleteCookie(S8S_TEST_ID_COOKIE_NAME)
  deleteCookie(S8S_RESULT_ID_COOKIE_NAME)
  deleteCookie(S8S_INJECTS_RUM_COOKIE_NAME)
  resetInitCookies()
}
