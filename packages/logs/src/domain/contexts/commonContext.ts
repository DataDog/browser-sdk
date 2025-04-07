import type { ContextManager } from '@datadog/browser-core'
import type { CommonContext } from '../../rawLogsEvent.types'

export function buildCommonContext(
  globalContextManager: ContextManager,
  userContextManager: ContextManager,
  accountContextManager: ContextManager
): CommonContext {
  let referrer: string = ''
  let url: string = ''

  const isServiceWorker = typeof self !== 'undefined' && 'ServiceWorkerGlobalScope' in self

  if (!isServiceWorker && typeof document !== 'undefined') {
    referrer = document.referrer
  }

  if (isServiceWorker) {
    url = self.location.href
  } else if (typeof window !== 'undefined' && window.location) {
    url = window.location.href
  }

  return {
    view: {
      referrer,
      url,
    },
    context: globalContextManager.getContext(),
    user: userContextManager.getContext(),
    account: accountContextManager.getContext(),
  }
}
