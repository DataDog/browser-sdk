import { getInitCookie, type Configuration } from '@datadog/browser-core'

import { createCookieObservable } from '../../browser/cookieObservable'

export const CI_VISIBILITY_TEST_ID_COOKIE_NAME = 'datadog-ci-visibility-test-execution-id'

export interface CiTestWindow extends Window {
  Cypress?: {
    env: (key: string) => string | undefined
  }
}

export type CiVisibilityContext = ReturnType<typeof startCiVisibilityContext>

export function startCiVisibilityContext(
  configuration: Configuration,
  cookieObservable = createCookieObservable(configuration, CI_VISIBILITY_TEST_ID_COOKIE_NAME)
) {
  let testExecutionId =
    getInitCookie(CI_VISIBILITY_TEST_ID_COOKIE_NAME) || (window as CiTestWindow).Cypress?.env('traceId')

  const cookieObservableSubscription = cookieObservable.subscribe((value) => {
    testExecutionId = value
  })

  return {
    get: () => {
      if (typeof testExecutionId === 'string') {
        return {
          test_execution_id: testExecutionId,
        }
      }
    },
    stop: () => cookieObservableSubscription.unsubscribe(),
  }
}
