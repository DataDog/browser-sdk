import type { Observable, RawError, PageMayExitEvent, Encoder, TimeoutId } from '@datadog/browser-core'
import {
  clearInterval,
  createBatch,
  createFlushController,
  createHttpRequest,
  dateNow,
  DeflateEncoderStreamId,
  display,
  ExperimentalFeature,
  isExperimentalFeatureEnabled,
  setInterval,
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

  // Chaos controller: buffers, reorders, and drops view_update events for backend resilience testing
  const chaosController = isExperimentalFeatureEnabled(ExperimentalFeature.VIEW_UPDATE_CHAOS)
    ? startChaosController(batch, getChaosConfig())
    : undefined

  lifeCycle.subscribe(LifeCycleEventType.RUM_EVENT_COLLECTED, (serverRumEvent: AssembledRumEvent) => {
    if (serverRumEvent.type === RumEventType.VIEW) {
      // Store snapshot for future view_update strip
      assembledViewSnapshots.set(serverRumEvent.view.id, serverRumEvent)
      batch.upsert(serverRumEvent, serverRumEvent.view.id)

      // On view end: flush chaos buffer for this view, then clean up
      if (!serverRumEvent.view.is_active) {
        if (chaosController) {
          chaosController.flushView(serverRumEvent.view.id)
        }
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
        for (const key of Object.keys(update)) {
          if (VIEW_UPDATE_ROUTING_KEYS.has(key) || key === 'display') {
            continue
          }
          if (update[key] !== undefined) {
            snap[key] = update[key]
          }
        }
        const updateViewport = update.display?.viewport
        if (updateViewport) {
          snap.display = { ...snap.display, viewport: updateViewport }
        }
      }

      if (snapshot && isExperimentalFeatureEnabled(ExperimentalFeature.VIEW_UPDATE_CHAOS)) {
        logStripDiagnostics(serverRumEvent, stripped, snapshot)
      }

      if (chaosController) {
        chaosController.enqueue(stripped)
      } else {
        batch.add(stripped)
      }
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

// ─── Chaos Controller ──────────────────────────────────────────────────────

interface ChaosConfig {
  dropRate: number // 0.0-1.0: probability of dropping a view_update
  reorderWindowMs: number // Buffer window before release
  releaseIntervalMs: number // How often to flush the chaos buffer
  shuffleOnRelease: boolean // Randomize order within release batch
}

const DEFAULT_CHAOS_CONFIG: ChaosConfig = {
  dropRate: 0.2,
  reorderWindowMs: 5000,
  releaseIntervalMs: 2000,
  shuffleOnRelease: true,
}

function getChaosConfig(): ChaosConfig {
  // Allow runtime override via window.__RUM_CHAOS_CONFIG__
  const win = typeof window !== 'undefined' ? (window as any) : undefined
  const override = win?.__RUM_CHAOS_CONFIG__
  if (override && typeof override === 'object') {
    return {
      dropRate: typeof override.dropRate === 'number' ? override.dropRate : DEFAULT_CHAOS_CONFIG.dropRate,
      reorderWindowMs:
        typeof override.reorderWindowMs === 'number' ? override.reorderWindowMs : DEFAULT_CHAOS_CONFIG.reorderWindowMs,
      releaseIntervalMs:
        typeof override.releaseIntervalMs === 'number'
          ? override.releaseIntervalMs
          : DEFAULT_CHAOS_CONFIG.releaseIntervalMs,
      shuffleOnRelease:
        typeof override.shuffleOnRelease === 'boolean'
          ? override.shuffleOnRelease
          : DEFAULT_CHAOS_CONFIG.shuffleOnRelease,
    }
  }
  return DEFAULT_CHAOS_CONFIG
}

interface ChaosController {
  enqueue: (event: AssembledRumEvent) => void
  flushView: (viewId: string) => void
  stop: () => void
  getStats: () => { buffered: number; dropped: number; released: number }
}

function startChaosController(batch: ReturnType<typeof createBatch>, config: ChaosConfig): ChaosController {
  const buffer: Array<{ event: AssembledRumEvent; bufferedAt: number }> = []
  let totalDropped = 0
  let totalReleased = 0

  // Release loop: periodically flush events older than reorderWindowMs
  const intervalId: TimeoutId = setInterval(() => {
    releaseOldEvents()
  }, config.releaseIntervalMs)

  function releaseOldEvents() {
    const now = dateNow()
    const ready: AssembledRumEvent[] = []
    const remaining: Array<{ event: AssembledRumEvent; bufferedAt: number }> = []

    for (const entry of buffer) {
      if (now - entry.bufferedAt >= config.reorderWindowMs) {
        ready.push(entry.event)
      } else {
        remaining.push(entry)
      }
    }

    buffer.length = 0
    buffer.push(...remaining)

    if (ready.length === 0) {
      return
    }

    if (config.shuffleOnRelease) {
      fisherYatesShuffle(ready)
    }

    for (const event of ready) {
      batch.add(event)
    }
    totalReleased += ready.length

    display.debug(`[RUM Chaos] Releasing ${ready.length} events (shuffled: ${config.shuffleOnRelease})`)
  }

  function flushView(viewId: string) {
    // On view end: release all buffered events for this view immediately (no shuffle, no drop)
    const forView: AssembledRumEvent[] = []
    const rest: Array<{ event: AssembledRumEvent; bufferedAt: number }> = []

    for (const entry of buffer) {
      if ((entry.event as any).view?.id === viewId) {
        forView.push(entry.event)
      } else {
        rest.push(entry)
      }
    }

    buffer.length = 0
    buffer.push(...rest)

    for (const event of forView) {
      batch.add(event)
    }
    totalReleased += forView.length

    if (forView.length > 0) {
      display.debug(
        `[RUM Chaos] View end flush: released ${forView.length} buffered events for view=${viewId.slice(0, 8)}`
      )
    }
  }

  return {
    enqueue(event: AssembledRumEvent) {
      // Roll for drop
      if (Math.random() < config.dropRate) {
        totalDropped++
        const docVersion = (event as any)._dd?.document_version ?? '?'
        const viewId = String((event as any).view?.id ?? '?').slice(0, 8)
        display.debug(`[RUM Chaos] Dropped view_update doc_version=${docVersion} for view=${viewId}`)
        return
      }
      buffer.push({ event, bufferedAt: dateNow() })
      display.debug(`[RUM Chaos] Buffer size: ${buffer.length}, total dropped: ${totalDropped}`)
    },
    flushView,
    stop() {
      clearInterval(intervalId)
      // Release everything remaining
      for (const entry of buffer) {
        batch.add(entry.event)
      }
      totalReleased += buffer.length
      buffer.length = 0
    },
    getStats() {
      return { buffered: buffer.length, dropped: totalDropped, released: totalReleased }
    },
  }
}

function fisherYatesShuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
}
