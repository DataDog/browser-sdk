import type { Batch } from '../../transport/transport'

export const monitoringConfiguration: {
  batch?: Batch
  debugMode?: boolean
  maxMessagesPerPage: number
  sentMessageCount: number
} = { maxMessagesPerPage: 0, sentMessageCount: 0 }
