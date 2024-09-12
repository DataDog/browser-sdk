import { assign, type RelativeTime } from '@datadog/browser-core'
import type { RumSessionManager } from '../rumSessionManager'
import type { RumPlugin } from '../plugins'
import { getPluginsInternalContext } from '../plugins'
import type { ViewContexts } from './viewContexts'
import type { UrlContexts } from './urlContexts'

export interface InternalContext {
  application_id: string
  session_id: string | undefined
  view?: {
    id: string
    url: string
    referrer: string
    name?: string
  }
  user_action?: {
    id: string | string[]
  }
}

/**
 * Internal context keep returning v1 format
 * to not break compatibility with logs data format
 */
export function startInternalContext(
  plugins: RumPlugin[],
  applicationId: string,
  sessionManager: RumSessionManager,
  viewContexts: ViewContexts,
  urlContexts: UrlContexts
) {
  return {
    get: (startTime?: number): InternalContext | undefined => {
      const viewContext = viewContexts.findView(startTime as RelativeTime)
      const urlContext = urlContexts.findUrl(startTime as RelativeTime)
      const session = sessionManager.findTrackedSession(startTime as RelativeTime)
      if (session && viewContext && urlContext) {
        const pluginsInternalContext = getPluginsInternalContext(plugins, startTime as RelativeTime)
        const internalContext = assign(pluginsInternalContext, {
          application_id: applicationId,
          session_id: session.id,
          view: { id: viewContext.id, name: viewContext.name, referrer: urlContext.referrer, url: urlContext.url },
        })

        return internalContext
      }
    },
  }
}
