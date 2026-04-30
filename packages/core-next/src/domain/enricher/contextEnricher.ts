import type { ContextManager } from '../context/context'
import { enricher } from './factory'

function contextEnricher(
  globalContext: ContextManager,
  userContext: ContextManager,
  accountContext: ContextManager,
  anonymousId?: string
) {
  return enricher({
    name: 'context',
    transform: (data: Record<string, unknown>) => {
      const accountCtx = accountContext.get()
      const hasAccount = Object.keys(accountCtx).length > 0
      const usr = userContext.get()
      const globalCtx = globalContext.get()
      const hasGlobal = Object.keys(globalCtx).length > 0
      return {
        ...data,
        ...(hasGlobal && { context: globalCtx }),
        usr: {
          ...usr,
          ...(anonymousId && !usr.anonymous_id && { anonymous_id: anonymousId }),
        },
        ...(hasAccount && { account: accountCtx }),
      }
    },
  })
}

export { contextEnricher }
