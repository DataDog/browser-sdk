import type { Context } from '@datadog/browser-core'
import { sanitize } from '@datadog/browser-core'
import type { ContextEvent } from '../event'
import { EVENT } from '../event'
import type { TransportManager } from '../transportManager'

export const CONTEXT_TYPE = {
  global: 'global',
  view: 'view',
  user: 'user',
  account: 'account',
} as const

export type ContextType = (typeof CONTEXT_TYPE)[keyof typeof CONTEXT_TYPE]

export function setContext(transportManager: TransportManager, type: ContextType, context: Context) {
  const data: ContextEvent = {
    type: EVENT.CONTEXT,
    contextType: type,
    context: sanitize(context),
  }

  transportManager.send(data)
}
