import { getInitCookie } from '@datadog/browser-core'
import type { Configuration } from '@datadog/browser-core'
import { createCookieObservable } from '../../browser/cookieObservable'
import type { Hooks, PartialRumEvent } from '../../hooks'
import { HookNames } from '../../hooks'
import { SessionType } from '../rumSessionManager'

export const CI_VISIBILITY_TEST_ID_COOKIE_NAME = 'datadog-ci-visibility-test-execution-id'

export interface CiTestWindow extends Window {
  Cypress?: {
    env: (key: string) => string | undefined
  }
}

export type CiVisibilityContext = ReturnType<typeof startCiVisibilityContext>

export function startCiVisibilityContext(
  configuration: Configuration,
  hooks: Hooks,
  cookieObservable = createCookieObservable(configuration, CI_VISIBILITY_TEST_ID_COOKIE_NAME)
) {
  let testExecutionId =
    getInitCookie(CI_VISIBILITY_TEST_ID_COOKIE_NAME) || (window as CiTestWindow).Cypress?.env('traceId')

  const cookieObservableSubscription = cookieObservable.subscribe((value) => {
    testExecutionId = value
  })

  hooks.register(HookNames.Assemble, ({ eventType }): PartialRumEvent | undefined => {
    if (typeof testExecutionId !== 'string') {
      return
    }

    return {
      type: eventType,
      session: {
        type: SessionType.CI_TEST,
      },
      ci_test: {
        test_execution_id: testExecutionId,
      },
    }
  })

  return {
    stop: () => {
      cookieObservableSubscription.unsubscribe()
    },
  }
}
