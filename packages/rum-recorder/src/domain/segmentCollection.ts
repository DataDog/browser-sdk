import { addEventListener, DOM_EVENT, EventEmitter, monitor } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType, ParentContexts, RumSession } from '@datadog/browser-rum-core'
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
// concatenating multiple segments together. Segments have a size overhead (meta), so our goal is to
// build segments containing as much records as possible while complying with the various flush
// strategies to guarantee a good replay quality.
//
// When the recording starts, a segment is initially created.  The segment is flushed (finalized and
// sent) based on various events (non-exhaustive list):
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
  session: RumSession,
  parentContexts: ParentContexts,
  send: (data: Uint8Array, meta: SegmentMeta) => void
) {
  const worker = createDeflateWorker()
  return doStartSegmentCollection(
    lifeCycle,
    () => doGetSegmentContext(applicationId, session, parentContexts),
    send,
    worker
  )
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
  let nextSegmentCreationReason: CreationReason = 'init'

  const writer = new DeflateSegmentWriter(
    worker,
    (size) => {
      if (size > SEND_BEACON_BYTE_LENGTH_LIMIT) {
        flushSegment('max_size')
      }
    },
    (data, meta) => {
      send(data, meta)
    }
  )

  // Flush when the RUM view changes
  const { unsubscribe: unsubscribeViewCreated } = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, () => {
    flushSegment('view_change')
  })

  // Flush when the session is renewed
  const { unsubscribe: unsubscribeSessionRenewed } = lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    flushSegment('session_renewed')
  })

  // Flush when leaving the page
  const { unsubscribe: unsubscribeBeforeUnload } = lifeCycle.subscribe(LifeCycleEventType.BEFORE_UNLOAD, () => {
    flushSegment('before_unload')
  })

  // Flush when visibility changes
  const { stop: unsubscribeVisibilityChange } = addEventListener(
    emitter,
    DOM_EVENT.VISIBILITY_CHANGE,
    () => {
      if (document.visibilityState === 'hidden') {
        flushSegment('visibility_change')
      }
    },
    { capture: true }
  )

  function flushSegment(creationReason: CreationReason) {
    if (currentSegment) {
      currentSegment.flush()
      currentSegment = undefined
      clearTimeout(currentSegmentExpirationTimeoutId)
    }

    nextSegmentCreationReason = creationReason
  }

  return {
    addRecord(record: Record) {
      if (!currentSegment) {
        const context = getSegmentContext()
        if (!context) {
          return
        }

        currentSegment = new Segment(writer, context, nextSegmentCreationReason, record)
        // Replace the newly created segment after MAX_SEGMENT_DURATION
        currentSegmentExpirationTimeoutId = setTimeout(
          monitor(() => {
            flushSegment('max_duration')
          }),
          MAX_SEGMENT_DURATION
        )
      } else {
        currentSegment.addRecord(record)
      }
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

export function doGetSegmentContext(applicationId: string, session: RumSession, parentContexts: ParentContexts) {
  if (!session.isTracked()) {
    return undefined
  }
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
