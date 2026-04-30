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
      return {
        ...data,
        ...globalContext.get(),
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
