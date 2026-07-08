import type { Context } from '@datadog/js-core/assembly'

export interface RumInternalContext extends Context {
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
