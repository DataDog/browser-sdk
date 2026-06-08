import type { Duration, RelativeTime } from '@datadog/js-core/time'
import type { TelemetryEvent } from '@datadog/browser-core'
import { createHook } from '@datadog/js-core/assembly'
import type { Hook, RecursivePartial } from '@datadog/js-core/assembly'
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

// Use readonly and DeepReadonly to prevents assemble hook callbacks from mutating the inputs.
// DeepReadonly is only applied to objects rather than the entire AssembleHookParams to avoid casts for primitives.
export interface AssembleHookParams {
  readonly eventType: RumEvent['type']
  rawRumEvent: DeepReadonly<RawRumEvent>
  domainContext: DeepReadonly<RumEventDomainContext<RawRumEvent['type']>>
  readonly startTime: RelativeTime
  readonly duration?: Duration | undefined
}

export type AssembleHook = Hook<AssembleHookParams, DefaultRumEventAttributes>
export type AssembleTelemetryHook = Hook<{ startTime: RelativeTime }, DefaultTelemetryEventAttributes>

export interface Hooks {
  assemble: AssembleHook
  assembleTelemetry: AssembleTelemetryHook
}

export function createHooks(): Hooks {
  return {
    assemble: createHook(),
    assembleTelemetry: createHook(),
  }
}
