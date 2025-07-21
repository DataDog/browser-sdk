import type { Context } from '../../tools/serialisation/context'

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
