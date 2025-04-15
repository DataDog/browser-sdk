import type { Context } from '@datadog/browser-core'
import { sanitize } from '@datadog/browser-core'
import type { ContextEvent } from '../event'
import { EVENT } from '../event'
import type { TransportManager } from '../transportManager'

type ValueOf<T> = T[keyof T]

export const CONTEXT_TYPE = {
  global: 'globalContext',
  view: 'viewContext',
  user: 'user',
  account: 'account',
} as const

const eventTypeByContextType: Record<ValueOf<typeof CONTEXT_TYPE>, ContextEvent['type']> = {
  globalContext: EVENT.GLOBAL_CONTEXT,
  viewContext: EVENT.VIEW_CONTEXT,
  user: EVENT.USER,
  account: EVENT.ACCOUNT,
}

export type ContextType = (typeof CONTEXT_TYPE)[keyof typeof CONTEXT_TYPE]

export function setContext(transportManager: TransportManager, type: ContextType, context: Context) {
  const data: ContextEvent = {
    type: eventTypeByContextType[type],
    context: sanitize(context),
  }

  transportManager.send(data)
}
