// PoC v3 (plan-v3.md): the internal API does not encode the "single view at a time, always a view
// active" rule — starting a view is a plain startEvent there. This helper is the view-tracking
// policy, written in one place: it ends the open view(s) at the new view's start (end-exclusive:
// events at that instant belong to the new view) and starts the new one. Used by the public API
// startView, the automatic view tracking (trackViews), the router plugins and the Shopify
// bindings.
import { clocksNow } from '@datadog/js-core/time'
import type { Context } from '@datadog/browser-core'
import type { BaseRumEvent, EventBaggage, EventHandle, RumInternalApi } from '../internalApi/rumInternalApi.types'

export function startViewSuperseding(
  internalApi: RumInternalApi,
  kickoff: Extract<BaseRumEvent, { type: 'view' }> & Context,
  baggage?: Partial<EventBaggage>
): EventHandle<'view'> {
  const startClocks = baggage?.startClocks ?? clocksNow()
  // Stop the open view(s) first, so the new view starts with none open (the internal API logs a
  // telemetry debug on overlapping views). Today's consumers keep a single view; ending all the
  // open ones keeps the helper agnostic of that rule.
  for (const entry of internalApi.findEvents({ type: 'view', open: true })) {
    if (!entry.complete) {
      entry.handle?.stop(undefined, { endClocks: startClocks })
    }
  }
  return internalApi.startEvent(kickoff, { ...baggage, startClocks })
}
