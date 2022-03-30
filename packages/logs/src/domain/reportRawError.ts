import type { RawError } from '@datadog/browser-core'
import type { LogsEvent } from '../logsEvent.types'
import { StatusType } from './logger'
import type { Sender } from './sender'

export function reportRawError(error: RawError, sender: Sender) {
  const messageContext: Partial<LogsEvent> = {
    date: error.startClocks.timeStamp,
    error: {
      kind: error.type,
      origin: error.source,
      stack: error.stack,
    },
  }
  sender.sendToHttp(error.message, messageContext, StatusType.error)
}
