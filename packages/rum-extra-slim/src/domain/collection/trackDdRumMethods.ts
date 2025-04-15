import type { Context } from '@datadog/browser-core'
import { instrumentMethod } from '@datadog/browser-core'
import type { RumPublicApi } from '@datadog/browser-rum-core'
import type { TransportManager } from '../transportManager'
import { addError } from './addError'
import type { ContextType } from './setContext'
import { CONTEXT_TYPE, setContext } from './setContext'
import { addAction } from './addAction'
import { addFeatureFlagEvaluation } from './addFeatureFlagEvaluation'

type Stoppable = { stop: () => void }

type GlobalRum = {
  onReady?(fn: () => void): void
} & RumPublicApi

export function trackDDRumMethods(transportManager: TransportManager) {
  const globalRum = (window as any).DD_RUM as GlobalRum
  if (!globalRum || !globalRum.onReady) {
    return () => void {}
  }

  const subscriptions: Stoppable[] = []

  globalRum.onReady(() => {
    for (const contextType of Object.values(CONTEXT_TYPE)) {
      subscriptions.push(
        instrumentMethod(globalRum as any, getContextMethod(contextType), ({ parameters }) =>
          setContext(transportManager, contextType, parameters[0] as Context)
        )
      )
    }

    subscriptions.push(
      instrumentMethod(globalRum, 'addError', ({ parameters }) =>
        addError(transportManager, parameters[0], parameters[1])
      ),
      instrumentMethod(globalRum, 'addFeatureFlagEvaluation', ({ parameters }) => {
        addFeatureFlagEvaluation(transportManager, parameters[0], parameters[1])
      }),
      instrumentMethod(globalRum, 'addAction', ({ parameters }) => {
        addAction(transportManager, parameters[0], parameters[1])
      })
    )
  })

  return () => subscriptions.forEach((subscription) => subscription.stop())
}

function getContextMethod(contextType: ContextType) {
  return `set${contextType.charAt(0).toUpperCase() + contextType.slice(1)}`
}
