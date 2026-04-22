import type { ContextManager } from '../context/context'
import { enricher } from './factory'

function contextEnricher(
  globalContext: ContextManager,
  userContext: ContextManager,
  accountContext: ContextManager
) {
  return enricher({
    name: 'context',
    transform: (data: Record<string, unknown>) => {
      const accountCtx = accountContext.get()
      const hasAccount = Object.keys(accountCtx).length > 0
      return {
        ...data,
        ...globalContext.get(),
        usr: userContext.get(),
        ...(hasAccount && { account: accountCtx }),
      }
    },
  })
}

export { contextEnricher }
