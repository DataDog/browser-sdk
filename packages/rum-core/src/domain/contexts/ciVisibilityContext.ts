import type { Configuration } from '@datadog/browser-core'
import { display, getInitCookie, HookNames, SKIPPED } from '@datadog/browser-core'
import { createCookieObservable } from '../../browser/cookieObservable'
import { SessionType } from '../rumSessionManager'
import type { DefaultRumEventAttributes, Hooks } from '../hooks'

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
  let testExecutionId = getInitCookie(CI_VISIBILITY_TEST_ID_COOKIE_NAME) || readCypressTraceId()

  const cookieObservableSubscription = cookieObservable.subscribe((value) => {
    testExecutionId = value
  })

  hooks.register(HookNames.Assemble, ({ eventType }): DefaultRumEventAttributes | SKIPPED => {
    if (typeof testExecutionId !== 'string') {
      return SKIPPED
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

function readCypressTraceId(): string | undefined {
  const cypress = (window as CiTestWindow).Cypress
  if (!cypress) {
    return undefined
  }
  try {
    return cypress.env('traceId')
  } catch {
    display.warn(
      'Failed to read Cypress test execution id via Cypress.env(). Upgrade dd-trace-js to >= 5.88.0 to keep RUM ↔ test correlation working.'
    )
    return undefined
  }
}
