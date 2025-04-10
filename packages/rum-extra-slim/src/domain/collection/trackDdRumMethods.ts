import type { Context } from '@datadog/browser-core'
import { instrumentMethod } from '@datadog/browser-core'
import type { TransportManager } from '../transportManager'
import { addError } from './addError'
import type { ContextType } from './setContext'
import { CONTEXT_TYPE, setContext } from './setContext'

type Stoppable = { stop: () => void }

export function trackDDRumMethods(transportManager: TransportManager) {
  if (!('DD_RUM' in window)) {
    return () => void {}
  }

  const subscriptions: Stoppable[] = []

  for (const contextType of Object.values(CONTEXT_TYPE)) {
    subscriptions.push(
      instrumentMethod(window.DD_RUM as any, getContextMethod(contextType), ({ parameters }) =>
        setContext(transportManager, contextType, parameters[0] as Context)
      )
    )
  }

  subscriptions.push(
    instrumentMethod(window.DD_RUM as any, 'addError', ({ parameters }) =>
      addError(transportManager, parameters[0], parameters[1])
    )
  )

  return () => subscriptions.forEach((subscription) => subscription.stop())
}

function getContextMethod(contextType: ContextType) {
  return `set${contextType.charAt(0).toUpperCase() + contextType.slice(1)}${['account', 'user'].includes(contextType) ? '' : 'Context'}`
}
