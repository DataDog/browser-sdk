// Those types are coming from the Web-UI Session Replay Player. Please keep them as close as
// possible to the original types.

import type { BrowserRecord, RecordType } from '@datadog/browser-rum/src/types'

export enum MessageBridgeUpType {
  READY = 'ready',
  RECORD_APPLIED = 'record_applied',
  LOG = 'log',
  ERROR = 'error',
  METRIC_TIMING = 'timing',
  METRIC_INCREMENT = 'increment',
  CAPABILITIES = 'capabilities',
  SERVICE_WORKER_ACTIVATED = 'service_worker_activated',
  RENDERER_DIMENSIONS = 'renderer_dimensions',
  ELEMENT_POSITION = 'element_position',
}

export enum MessageBridgeDownType {
  RECORD = 'record',
  RESET = 'reset',
  ELEMENT_POSITION = 'element_position',
}

export enum MessageBridgeUpLogLevel {
  LOG = 'log',
  DEBUG = 'debug',
  WARN = 'warn',
  ERROR = 'error',
}

export interface Dimensions {
  width: number
  height: number
}

export type StaticFrameContext = {
  origin: string
  featureFlags: { [flagName: string]: boolean }
  tabId: string
  // Optional params will only be true to avoid confusions with stringified 'false'
  isHot?: true
  /**
   * If the HTMLRenderers should report the offset dimensions to the parent window or not
   */
  reportDimensions?: true

  /**
   * If the HTMLRenderers should be rendered to full height without cropping in the viewport
   */
  isFullHeight?: true

  /**
   * If animations and transitions should be disabled in the HTMLRenderers
   */
  areAnimationsDisabled?: true
}

/**
 * For message types that benefit from verbose context (RUM logs and errors), the
 * following properties are reserved so context can be added at each level of the message
 * bridges without worry of conflicts. For simplicity, this type is shared across message
 * bridges, even though, for example, the service worker will never implement other contexts.
 */
export type MessageBridgeVerboseContext = {
  sessionReplayContext?: {
    viewId?: string
    sessionId?: string
  }
  isolationSandboxContext?: {
    pageUrl?: string
  }
  serviceWorkerContext?: {
    registrationUrl?: string
    version?: string
    fetchUrl?: string
    destination?: string
  }
} & Record<string, any>

type RawMessageBridgeUp =
  | MessageBridgeUpReady
  | MessageBridgeUpRecordApplied
  | MessageBridgeUpLog
  | MessageBridgeUpError
  | MessageBridgeUpTiming
  | MessageBridgeUpIncrement
  | MessageBridgeUpCapabilities
  | MessageBridgeUpServiceWorkerActivated
  | MessageBridgeUpRendererDimensions
  | MessageBridgeUpElementPosition

export type MessageBridgeUp = {
  sentAt: number
  tabId: string
  viewId?: string
} & RawMessageBridgeUp

/**
 * Message send by the sanboxing when iframe is ready
 */
export type MessageBridgeUpReady = {
  type: MessageBridgeUpType.READY
}

/**
 * Message send by the sanboxing when a record has been applied
 */
export type MessageBridgeUpRecordApplied = {
  type: MessageBridgeUpType.RECORD_APPLIED
  /** OrderId of the Record applied */
  orderId: number
  /** Type of the Record applied */
  recordType: RecordType
}

/**
 * Message send by the sanboxing when a log is sent
 */
export type MessageBridgeUpLog = {
  type: MessageBridgeUpType.LOG
  level: MessageBridgeUpLogLevel
  message: string
  context?: { [key: string]: any }
}

/**
 * Message send by the sanboxing iframe when there is an error
 */
export type MessageBridgeUpError = {
  type: MessageBridgeUpType.ERROR
  serialisedError: SerialisedError
  context?: { [key: string]: any }
}

/**
 * Message send by the sanboxing iframe with a custom timing
 */
export type MessageBridgeUpTiming = {
  type: MessageBridgeUpType.METRIC_TIMING
  name: string
  duration: number
  context?: { [key: string]: any }
}

/**
 * Message send by the sanboxing iframe with a custom count
 */
export type MessageBridgeUpIncrement = {
  type: MessageBridgeUpType.METRIC_INCREMENT
  name: string
  value: number
  context?: { [key: string]: any }
}

export type MessageBridgeUpCapabilities = {
  type: MessageBridgeUpType.CAPABILITIES
  capabilities: {
    SERVICE_WORKER: boolean
    THIRD_PARTY_STORAGE: boolean
  }
}

export type MessageBridgeUpServiceWorkerActivated = {
  type: MessageBridgeUpType.SERVICE_WORKER_ACTIVATED
}

export type MessageBridgeUpRendererDimensions = {
  type: MessageBridgeUpType.RENDERER_DIMENSIONS
  dimensions: Dimensions
}

export type ElementPositionResponse = {
  cssSelector: string
  position: Omit<DOMRect, 'toJSON'>
}

export type MessageBridgeUpElementPosition = {
  type: MessageBridgeUpType.ELEMENT_POSITION
  positions: ElementPositionResponse[]
}

type MessageBridgeMetadata = {
  sentAt: number
}

export type MessageBridgeDown = MessageBridgeDownRecords | MessageBridgeDownReset | MessageBridgeDownElementPosition

export type MessageBridgeDownReset = {
  type: MessageBridgeDownType.RESET
} & MessageBridgeMetadata

export type MessageBridgeDownRecords = {
  type: MessageBridgeDownType.RECORD
  record: RecordWithMetadata
} & MessageBridgeMetadata

export type MessageBridgeDownElementPosition = {
  type: MessageBridgeDownType.ELEMENT_POSITION
  cssSelectors: string[]
} & MessageBridgeMetadata

export type SerialisedError = {
  name: string
  message: string
  stack?: string
}

export type RecordWithSegmentData<T extends BrowserRecord = BrowserRecord> = T & {
  viewId: string
  segmentSource: 'browser' | undefined
}

export type RecordWithMetadata<T extends BrowserRecord = BrowserRecord> = RecordWithSegmentData<T> & {
  /**
   * index of the record inside the view
   */
  orderId: number
  /**
   * Is the player preparing a seek?
   * when seeking we might have to apply record before actually
   * showing the content to the user
   * this flag inform us this behavior
   */
  isSeeking: boolean
  /**
   * Should we apply back pressure on the timer when applying this record
   * This is used by the renderer of the sandbox
   * By default, it's only true for FS
   * (meta also block the timer but it's in the main app not in the sandbox)
   */
  shouldWaitForIt: boolean // 'DARY... LEGENDARY
}
