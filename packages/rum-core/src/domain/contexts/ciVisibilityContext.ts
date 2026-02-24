import { getInitCookie, HookNames, SKIPPED } from '@datadog/browser-core'
import type { Configuration } from '@datadog/browser-core'
import type { DecoratorFactory } from '@datadog/browser-core-next'
import { createCookieObservable } from '../../browser/cookieObservable'
import { SessionType } from '../rumSessionManager'
import type { DefaultRumEventAttributes, Hooks } from '../hooks'
import type { Observation } from '../pipeline/rumPipelineEvents'

export const CI_VISIBILITY_TEST_ID_COOKIE_NAME = 'datadog-ci-visibility-test-execution-id'

export function ciVisibilityDecoratorFactory(deps: {
  getTestExecutionId: () => string | undefined
}): DecoratorFactory<Observation, { ciTest?: { testExecutionId: string } }> {
  return {
    name: 'ciVisibility',
    provides: [],
    requires: [],
    capabilities: { canDiscard: false },
    create: () => ({
      decorate: (_event, _accumulated) => {
        const testExecutionId = deps.getTestExecutionId()
        if (typeof testExecutionId !== 'string') {
          return Promise.resolve({ status: 'skipped' as const })
        }
        return Promise.resolve({
          status: 'contributed' as const,
          attributes: { ciTest: { testExecutionId } },
        })
      },
    }),
  }
}

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
