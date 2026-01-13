import type {
  DISCARDED,
  Duration,
  HookNamesAsConst,
  RecursivePartial,
  RelativeTime,
  SKIPPED,
  TelemetryEvent,
} from '@datadog/browser-core'
import { abstractHooks } from '@datadog/browser-core'
import type { RumEvent } from '../rumEvent.types'
import type { RawRumEvent } from '../rawRumEvent.types'
import type { RumEventDomainContext } from '../domainContext.types'

// Define a partial RUM event type.
// Ensuring the `type` field is always present improves type checking, especially in conditional logic in hooks (e.g., `if (eventType === 'view')`).
export type DefaultRumEventAttributes = RecursivePartial<RumEvent> & { type: RumEvent['type'] }
export type DefaultTelemetryEventAttributes = RecursivePartial<TelemetryEvent>

type DeepReadonly<T> = {
  readonly [K in keyof T]: DeepReadonly<T[K]>
}

export interface AssembleHookParams {
  readonly eventType: RumEvent['type']
  rawRumEvent: DeepReadonly<RawRumEvent>
  domainContext: DeepReadonly<RumEventDomainContext<RawRumEvent['type']>>
  readonly startTime: RelativeTime
  readonly duration?: Duration | undefined
}

export interface HookCallbackMap {
  [HookNamesAsConst.ASSEMBLE]: (param: AssembleHookParams) => DefaultRumEventAttributes | SKIPPED | DISCARDED
  [HookNamesAsConst.ASSEMBLE_TELEMETRY]: (param: {
    startTime: RelativeTime
  }) => DefaultTelemetryEventAttributes | SKIPPED | DISCARDED
}

export type Hooks = ReturnType<typeof createHooks>

export const createHooks = abstractHooks<HookCallbackMap>
