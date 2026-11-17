// These are the parts of the session replay sandbox interface that the extension uses.
// Please keep them as close as possible to the original types.

import type { BrowserRecord } from '@datadog/browser-rum/src/types'

export enum MessageBridgeUpType {
  READY = 'ready',
  LOG = 'log',
  ERROR = 'error',
}

export enum MessageBridgeDownType {
  RECORD = 'record',
}

export enum MessageBridgeUpLogLevel {
  LOG = 'log',
  DEBUG = 'debug',
  WARN = 'warn',
  ERROR = 'error',
}

export interface StaticFrameContext {
  origin: string
  featureFlags: { [flagName: string]: boolean }
  sandboxId: string
}

/** The messages from the sandbox that the extension handles. The extension ignores the others. */
export type MessageBridgeUp = {
  sandboxId: string
} & (MessageBridgeUpReady | MessageBridgeUpLog | MessageBridgeUpError)

interface MessageBridgeUpReady {
  type: MessageBridgeUpType.READY
}

interface MessageBridgeUpLog {
  type: MessageBridgeUpType.LOG
  level: MessageBridgeUpLogLevel
  message: string
}

interface MessageBridgeUpError {
  type: MessageBridgeUpType.ERROR
  serialisedError: SerialisedError
}

interface SerialisedError {
  name: string
  message: string
  stack?: string
}

export interface MessageBridgeDownRecords {
  type: MessageBridgeDownType.RECORD
  record: RecordWithMetadata
  sentAt: number
}

type RecordWithMetadata = BrowserRecord & {
  viewId: string
  segmentSource: 'browser'
  applicationId: string
  orderId: number
  isSeeking: boolean
  shouldWaitForIt: boolean
}
