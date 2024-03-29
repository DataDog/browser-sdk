import { ONE_MINUTE, resetInitCookies, deleteCookie, setCookie } from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { CI_VISIBILITY_TEST_ID_COOKIE_NAME, type CiTestWindow } from '../src/domain/contexts/ciVisibilityContext'

// Duration to create a cookie lasting at least until the end of the test
const COOKIE_DURATION = ONE_MINUTE

export function mockCiVisibilityValues(testExecutionId: unknown, method: 'globals' | 'cookies' = 'globals') {
  switch (method) {
    case 'globals':
      ;(window as CiTestWindow).Cypress = {
        env: (key: string) => {
          if (typeof testExecutionId === 'string' && key === 'traceId') {
            return testExecutionId
          }
        },
      }

      break
    case 'cookies':
      if (typeof testExecutionId === 'string') {
        setCookie(CI_VISIBILITY_TEST_ID_COOKIE_NAME, testExecutionId, COOKIE_DURATION)
      }
      break
  }
  resetInitCookies()

  registerCleanupTask(() => {
    delete (window as CiTestWindow).Cypress
    deleteCookie(CI_VISIBILITY_TEST_ID_COOKIE_NAME)
    resetInitCookies()
  })
}
