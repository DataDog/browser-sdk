import type { Context, ResourceType } from '@datadog/browser-core'
import { mergeInto } from '@datadog/js-core/util'
import type { ActionType, VitalType } from '../../rawRumEvent.types'
import type { InternalRumEventType } from './rumInternalApi.types'

// Internal accumulator for the base event being built, dynamically merged. The public argument
// types (BaseRumEvent, PartialBaseRumEvent, in rumInternalApi.types.ts) carry the type safety;
// this stays loose on purpose.
export interface DraftEvent extends Context {
  type: InternalRumEventType
}

// Stamp the internal event id on the event's type-specific id field. The internal API owns the
// event ids, so callers never provide them (a caller-provided one is overwritten).
export function stampEventId(event: DraftEvent, eventId: string) {
  mergeInto(event, { [event.type]: { id: eventId } })
}

// Kickoff fields may be provided at start or at stop() for non-view started events, so their
// completeness cannot be enforced at the type level: validate the accumulated event at stop,
// per the throw-on-misuse policy.
export function assertKickoffFields(event: DraftEvent) {
  switch (event.type) {
    case 'action':
      if ((event.action as { type?: ActionType } | undefined)?.type === undefined) {
        throw new Error("Missing kickoff field 'action.type'.")
      }
      break
    case 'resource':
      if (
        (event.resource as { url?: string } | undefined)?.url === undefined ||
        (event.resource as { type?: ResourceType } | undefined)?.type === undefined
      ) {
        throw new Error("Missing kickoff fields 'resource.url' / 'resource.type'.")
      }
      break
    case 'vital':
      if (
        (event.vital as { name?: string } | undefined)?.name === undefined ||
        (event.vital as { type?: VitalType } | undefined)?.type === undefined
      ) {
        throw new Error("Missing kickoff fields 'vital.name' / 'vital.type'.")
      }
      break
  }
}
