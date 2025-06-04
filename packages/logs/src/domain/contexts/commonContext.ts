import type { ContextManager } from '@datadog/browser-core'
import type { CommonContext } from '../../rawLogsEvent.types'

export function buildCommonContext(userContextManager: ContextManager): CommonContext {
  return {
    view: {
      referrer: document.referrer,
      url: window.location.href,
    },
    user: userContextManager.getContext(),
  }
}
