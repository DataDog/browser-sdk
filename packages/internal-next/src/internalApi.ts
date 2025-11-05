import type { ClocksState } from '@datadog/browser-core'
import { BufferedObservable, clocksNow } from '@datadog/browser-core'
import type {
  AddDurationVitalOptions,
  DurationVitalOptions,
  DurationVitalReference,
  RawRumEventCollectedData,
  ViewCreatedEvent,
} from '@datadog/browser-rum-core'
import type { Logger, LogsMessage } from '@datadog/browser-logs'
import { SDK_VERSION } from './constants'

const INTERNAL_API_NAMESPACE_KEY = Symbol.for('DD_INTERNAL')

export interface InternalApi {
  version: string
  bus: BufferedObservable<MessageEnvelope>
  notify(message: Message): void
}

export interface MessageEnvelope {
  clocks: ClocksState
  message: Message
}

export const enum MessageType {
  CORE_SET_CONTEXT = 0,
  CORE_SET_CONTEXT_PROPERTY = 1,
  CORE_CLEAR_CONTEXT = 2,
  RUNTIME_ERROR = 3,
  RUM_ERROR = 4,
  RUM_ACTION = 5,
  RUM_ADD_DURATION_VITAL = 6,
  RUM_START_DURATION_VITAL = 7,
  RUM_STOP_DURATION_VITAL = 8,
  RUM_RAW_EVENT_COLLECTED = 9,
  RUM_VIEW_CREATED = 10,
  LOGS_MESSAGE = 11,
}

export const enum CoreContextType {
  GLOBAL = 0,
  USER = 1,
  ACCOUNT = 2,
}

export type Message =
  | {
      type: MessageType.CORE_SET_CONTEXT
      context: CoreContextType
      value: object
    }
  | {
      type: MessageType.CORE_SET_CONTEXT_PROPERTY
      context: CoreContextType
      key: string
      value: unknown
    }
  | {
      type: MessageType.CORE_CLEAR_CONTEXT
      context: CoreContextType
    }
  | {
      type: MessageType.RUNTIME_ERROR
      error: unknown
      event?: ErrorEvent
    }
  | {
      type: MessageType.RUM_ERROR
      error: unknown
      context: object | undefined
      handlingStack: string
      componentStack?: string
    }
  | {
      type: MessageType.RUM_ACTION
      name: string
      context: object | undefined
      handlingStack: string
    }
  | {
      type: MessageType.RUM_ADD_DURATION_VITAL
      name: string
      options: AddDurationVitalOptions
    }
  | {
      type: MessageType.RUM_START_DURATION_VITAL
      name: string
      ref: DurationVitalReference
      options?: DurationVitalOptions
    }
  | {
      type: MessageType.RUM_STOP_DURATION_VITAL
      nameOrRef: string | DurationVitalReference
      options?: DurationVitalOptions
    }
  | {
      type: MessageType.RUM_RAW_EVENT_COLLECTED
      data: RawRumEventCollectedData
    }
  | {
      type: MessageType.RUM_VIEW_CREATED
      event: ViewCreatedEvent
    }
  | {
      type: MessageType.LOGS_MESSAGE
      message: LogsMessage
      logger: Logger
      handlingStack?: string
    }

type GlobalWithInternalApiNamespace = typeof globalThis & {
  [INTERNAL_API_NAMESPACE_KEY]?: {
    // In the future, we can imagine having multiple instances of the internal API
    default: InternalApi
  }
}

export function getInternalApi(): InternalApi {
  // TODO: maybe enforce requesting a version
  const g = globalThis as GlobalWithInternalApiNamespace
  if (!g[INTERNAL_API_NAMESPACE_KEY]) {
    g[INTERNAL_API_NAMESPACE_KEY] = { default: createInternalApi() }
  }
  return g[INTERNAL_API_NAMESPACE_KEY].default
}

function createInternalApi(): InternalApi {
  const bus = new BufferedObservable<MessageEnvelope>(1000)
  return {
    version: SDK_VERSION,
    notify(message: Message) {
      bus.notify({
        clocks: clocksNow(),
        message,
      })
    },
    bus,
  }
}
