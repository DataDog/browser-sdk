import type { Observable, RawError, PageMayExitEvent, Encoder } from '@datadog/browser-core'
import {
  createBatch,
  createFlushController,
  createHttpRequest,
  DeflateEncoderStreamId,
  display,
  ExperimentalFeature,
  isExperimentalFeatureEnabled,
} from '@datadog/browser-core'
import type { RumConfiguration } from '../domain/configuration'
import type { LifeCycle } from '../domain/lifeCycle'
import { LifeCycleEventType } from '../domain/lifeCycle'
import type { AssembledRumEvent } from '../rawRumEvent.types'
import { RumEventType } from '../rawRumEvent.types'

export function startRumBatch(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  reportError: (error: RawError) => void,
  pageMayExitObservable: Observable<PageMayExitEvent>,
  sessionExpireObservable: Observable<void>,
  createEncoder: (streamId: DeflateEncoderStreamId) => Encoder
) {
  const endpoints = [configuration.rumEndpointBuilder]
  if (configuration.replica) {
    endpoints.push(configuration.replica.rumEndpointBuilder)
  }

  const batch = createBatch({
    encoder: createEncoder(DeflateEncoderStreamId.RUM),
    request: createHttpRequest(endpoints, reportError),
    flushController: createFlushController({
      pageMayExitObservable,
      sessionExpireObservable,
    }),
  })

  // Store last assembled VIEW event per view_id for post-assembly strip
  const assembledViewSnapshots = new Map<string, AssembledRumEvent>()

  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (serverRumEvent: AssembledRumEvent) => {
    if (serverRumEvent.type === RumEventType.VIEW) {
      // Store snapshot for future view_update strip
      assembledViewSnapshots.set(serverRumEvent.view.id, serverRumEvent)
      batch.upsert(serverRumEvent, serverRumEvent.view.id)

      // Cleanup on view end
      if (!serverRumEvent.view.is_active) {
        assembledViewSnapshots.delete(serverRumEvent.view.id)
      }
    } else if (serverRumEvent.type === RumEventType.VIEW_UPDATE) {
      const snapshot = assembledViewSnapshots.get(serverRumEvent.view.id)
      const stripped = snapshot ? stripUnchangedFields(serverRumEvent, snapshot) : serverRumEvent
      // After stripping, backfill snapshot fields that may have been absent on the baseline VIEW
      // but are now present on this view_update (e.g. usr set after init, viewport deferred via RAF).
      // This ensures subsequent view_updates can strip them when unchanged.
      if (snapshot) {
        const snap = snapshot as any
        const update = serverRumEvent as any
        // Backfill any top-level field from this VU into the snapshot so subsequent VUs can strip
        // it when unchanged. Covers fields absent from baseline VIEW (usr/feature_flags set after
        // init) and any future new top-level fields automatically.
        // Routing keys are always on the snapshot; display needs sub-field merge (see below).
        for (const key of Object.keys(update)) {
          if (VIEW_UPDATE_ROUTING_KEYS.has(key) || key === 'display') {
            continue
          }
          if (update[key] !== undefined) {
            snap[key] = update[key]
          }
        }
        // display.viewport: deferred via RAF, merge into snapshot without overwriting scroll
        const updateViewport = update.display?.viewport
        if (updateViewport) {
          snap.display = { ...snap.display, viewport: updateViewport }
        }
      }

      if (snapshot && isExperimentalFeatureEnabled(ExperimentalFeature.VIEW_UPDATE_CHAOS)) {
        logStripDiagnostics(serverRumEvent, stripped, snapshot)
      }

      batch.add(stripped)
    } else {
      batch.add(serverRumEvent)
    }
  })

  return batch
}

// Top-level keys that must always be present on a view_update for routing and identity.
// Everything else is stripped if equal to the VIEW snapshot (generic approach — new fields
// added to the schema are handled automatically without any code changes here).
const VIEW_UPDATE_ROUTING_KEYS = new Set(['type', 'application', 'date', 'view', 'session', '_dd'])

function stripUnchangedFields(
  viewUpdate: AssembledRumEvent & { type: typeof RumEventType.VIEW_UPDATE },
  snapshot: AssembledRumEvent
): AssembledRumEvent {
  const result = { ...viewUpdate } as any
  const snap = snapshot as any
  const update = viewUpdate as any

  // Strip any top-level field not needed for routing/identity if it equals the snapshot.
  // Covers all current session-static fields (usr, context, connectivity, feature_flags,
  // service, version, source, synthetics, ci_test, ddtags, ...) and future ones automatically.
  for (const key of Object.keys(result)) {
    if (VIEW_UPDATE_ROUTING_KEYS.has(key)) {
      continue
    }
    if (JSON.stringify(update[key]) === JSON.stringify(snap[key])) {
      delete result[key]
    }
  }

  // display.viewport: strip when unchanged even if display.scroll is also present.
  // The generic loop above can't handle this sub-field case: when scroll is present the full
  // display object differs from the snapshot (which only has viewport), so nothing is stripped
  // and the unchanged viewport leaks. Explicit sub-field strip after the generic pass fixes it.
  if (
    result.display?.viewport &&
    snap.display?.viewport &&
    JSON.stringify(result.display.viewport) === JSON.stringify(snap.display.viewport)
  ) {
    delete result.display.viewport
    if (Object.keys(result.display).length === 0) {
      result.display = undefined
    }
  }

  // view.name/url/referrer: sub-fields of the routing view object, strip when unchanged.
  if (update.view?.name === snap.view?.name) {
    delete result.view.name
  }
  if (update.view?.url === snap.view?.url && update.view?.referrer === snap.view?.referrer) {
    delete result.view.url
    delete result.view.referrer
  }

  // _dd: strip static per-session sub-fields; keep document_version (ordering) and drift (per-event).
  if (result._dd) {
    delete result._dd.format_version
    delete result._dd.sdk_name
    delete result._dd.configuration
    delete result._dd.browser_sdk_version
  }

  // session.type: always "user" (or "synthetics") for the entire session.
  // Keep session.id (routing), sampled_for_replay and has_replay (can change mid-session).
  if (result.session?.type !== undefined) {
    delete result.session.type
  }

  return result as AssembledRumEvent
}

function logStripDiagnostics(original: AssembledRumEvent, stripped: AssembledRumEvent, snapshot: AssembledRumEvent) {
  const orig = original as any
  const strip = stripped as any
  const snap = snapshot as any

  const strippedFields: string[] = []
  const keptChanged: string[] = []
  let bytesSaved = 0

  // Top-level fields present in original but absent in stripped
  for (const field of Object.keys(orig)) {
    if (!(field in strip)) {
      const size = JSON.stringify(orig[field]).length
      bytesSaved += size + field.length + 3
      strippedFields.push(`${field}(${size}B)`)
    }
  }

  // _dd sub-fields that were stripped
  const ddStripped = ['format_version', 'sdk_name', 'configuration', 'browser_sdk_version']
  for (const f of ddStripped) {
    if (orig._dd?.[f] !== undefined && strip._dd?.[f] === undefined) {
      const size = JSON.stringify(orig._dd[f]).length
      bytesSaved += size + f.length + 3
      strippedFields.push(`_dd.${f}(${size}B)`)
    }
  }

  // session.type
  if (orig.session?.type !== undefined && strip.session?.type === undefined) {
    const size = JSON.stringify(orig.session.type).length
    bytesSaved += size + 'type'.length + 3
    strippedFields.push(`session.type(${size}B)`)
  }

  // view sub-fields: name, url, referrer
  for (const f of ['name', 'url', 'referrer']) {
    if (orig.view?.[f] !== undefined && strip.view?.[f] === undefined) {
      const size = JSON.stringify(orig.view[f]).length
      bytesSaved += size + f.length + 3
      strippedFields.push(`view.${f}(${size}B)`)
    }
  }

  // display.viewport
  if (orig.display?.viewport !== undefined && strip.display?.viewport === undefined) {
    const size = JSON.stringify(orig.display.viewport).length
    bytesSaved += size + 'viewport'.length + 3
    strippedFields.push(`display.viewport(${size}B)`)
  }

  // Non-routing fields still present in stripped — kept because they changed vs snapshot
  for (const key of Object.keys(strip)) {
    if (VIEW_UPDATE_ROUTING_KEYS.has(key)) {
      continue
    }
    if (JSON.stringify(strip[key]) !== JSON.stringify(snap[key])) {
      keptChanged.push(key)
    }
  }

  const docVersion = strip._dd?.document_version ?? '?'
  const viewId = String(strip.view?.id ?? '?').slice(0, 8)

  display.debug(
    `[VU Strip] v=${docVersion} view=${viewId} | stripped: [${strippedFields.join(', ')}] (~${bytesSaved}B saved) | kept(changed): [${keptChanged.join(', ') || 'none'}]`
  )
}
