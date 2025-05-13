import type { ContextManager } from '@flashcatcloud/browser-core'
import type { CommonContext } from '../../rawLogsEvent.types'

export function buildCommonContext(
  globalContextManager: ContextManager,
  userContextManager: ContextManager,
  accountContextManager: ContextManager
): CommonContext {
  return {
    view: {
      referrer: document.referrer,
      url: window.location.href,
    },
    context: globalContextManager.getContext(),
    user: userContextManager.getContext(),
    account: accountContextManager.getContext(),
  }
}
