import { addEventListener, DOM_EVENT, EventEmitter, monitor } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType, ParentContexts } from '@datadog/browser-rum-core'
import { SEND_BEACON_BYTE_LENGTH_LIMIT } from '../transport/send'
import { CreationReason, Record, SegmentContext, SegmentMeta } from '../types'
import { DeflateSegmentWriter } from './deflateSegmentWriter'
import { createDeflateWorker, DeflateWorker } from './deflateWorker'
import { Segment } from './segment'

export const MAX_SEGMENT_DURATION = 30_000

// Segments are the main data structure for session replays. They contain context information used
// for indexing or UI needs, and a list of records (RRWeb 'events', renamed to avoid confusing
// namings). They are stored without any processing from the intake, and fetched one after the
// other while a session is being replayed. Their encoding (deflate) are carefully crafted to allow
// concatenating multiple segments together. Their approximative size limits how often they are
// created have an impact on the replay.
//
// When the recording starts, a segment is initially created.  The segment is renewed (finalized,
// sent and replaced by a new one) based on various events (non-exhaustive list):
//
// * the page visibility change or becomes to unload
// * the segment duration reaches a limit
// * the encoded segment size reaches a limit
// * ...
//
// A segment cannot be created without its context.  If the RUM session ends and no session id is
// available when creating a new segment, records will be ignored, until the session is renewed and
// a new session id is available.
//
// Empty segments (segments with no record) aren't useful and should be ignored.
//
// To help investigate session replays issues, each segment is created with a "creation reason",
// indicating why the session has been created.

export function startSegmentCollection(
  lifeCycle: LifeCycle,
  applicationId: string,
  parentContexts: ParentContexts,
  send: (data: Uint8Array, meta: SegmentMeta) => void
) {
  const worker = createDeflateWorker()
  return doStartSegmentCollection(lifeCycle, () => doGetSegmentContext(applicationId, parentContexts), send, worker)
}

export function doStartSegmentCollection(
  lifeCycle: LifeCycle,
  getSegmentContext: () => SegmentContext | undefined,
  send: (data: Uint8Array, meta: SegmentMeta) => void,
  worker: DeflateWorker,
  emitter: EventEmitter = window
) {
  let currentSegment: Segment | undefined
  let currentSegmentExpirationTimeoutId: ReturnType<typeof setTimeout>

  const writer = new DeflateSegmentWriter(
    worker,
    (size) => {
      if (size > SEND_BEACON_BYTE_LENGTH_LIMIT) {
        renewSegment('max_size')
      }
    },
    (data, meta) => {
      send(data, meta)
    }
  )

  renewSegment('init')

  // Renew when the RUM view changes
  const { unsubscribe: unsubscribeViewCreated } = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, () => {
    renewSegment('view_change')
  })

  // Renew when the session is renewed
  const { unsubscribe: unsubscribeSessionRenewed } = lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    renewSegment('session_renewed')
  })

  // Renew when leaving the page
  const { unsubscribe: unsubscribeBeforeUnload } = lifeCycle.subscribe(LifeCycleEventType.BEFORE_UNLOAD, () => {
    renewSegment('before_unload')
  })

  // Renew when visibility changes
  const { stop: unsubscribeVisibilityChange } = addEventListener(
    emitter,
    DOM_EVENT.VISIBILITY_CHANGE,
    () => {
      if (document.visibilityState === 'hidden') {
        renewSegment('visibility_change')
      }
    },
    { capture: true }
  )

  function renewSegment(creationReason: CreationReason) {
    if (currentSegment) {
      currentSegment.complete()
      currentSegment = undefined
      clearTimeout(currentSegmentExpirationTimeoutId)
    }

    const context = getSegmentContext()
    if (!context) {
      return
    }

    currentSegment = new Segment(writer, context, creationReason)

    // Replace the newly created segment after MAX_SEGMENT_DURATION
    currentSegmentExpirationTimeoutId = setTimeout(
      monitor(() => {
        renewSegment('max_duration')
      }),
      MAX_SEGMENT_DURATION
    )
  }

  return {
    addRecord(record: Record) {
      if (!currentSegment) {
        return
      }

      currentSegment.addRecord(record)
    },
    stop() {
      unsubscribeViewCreated()
      unsubscribeBeforeUnload()
      unsubscribeVisibilityChange()
      unsubscribeSessionRenewed()
      worker.terminate()
    },
  }
}

export function doGetSegmentContext(applicationId: string, parentContexts: ParentContexts) {
  const viewContext = parentContexts.findView()
  if (!viewContext?.session.id) {
    return undefined
  }
  return {
    application: {
      id: applicationId,
    },
    session: {
      id: viewContext.session.id,
    },
    view: {
      id: viewContext.view.id,
    },
  }
}
