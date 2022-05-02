import type { EventEmitter, TimeoutId } from '@datadog/browser-core'
import { addEventListener, DOM_EVENT, monitor } from '@datadog/browser-core'
import type { LifeCycle, ViewContexts, RumSessionManager } from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'
import { SEND_BEACON_BYTE_LENGTH_LIMIT } from '../../transport/send'
import type { CreationReason, Record, SegmentContext, SegmentMetadata } from '../../types'
import type { DeflateWorker } from './deflateWorker'
import { Segment } from './segment'

export const MAX_SEGMENT_DURATION = 30_000
let MAX_SEGMENT_SIZE = SEND_BEACON_BYTE_LENGTH_LIMIT

// Segments are the main data structure for session replays. They contain context information used
// for indexing or UI needs, and a list of records (RRWeb 'events', renamed to avoid confusing
// namings). They are stored without any processing from the intake, and fetched one after the
// other while a session is being replayed. Their encoding (deflate) are carefully crafted to allow
// concatenating multiple segments together. Segments have a size overhead (metadata), so our goal is to
// build segments containing as many records as possible while complying with the various flush
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
  sessionManager: RumSessionManager,
  viewContexts: ViewContexts,
  send: (data: Uint8Array, metadata: SegmentMetadata, rawSegmentSize: number) => void,
  worker: DeflateWorker
) {
  return doStartSegmentCollection(
    lifeCycle,
    () => computeSegmentContext(applicationId, sessionManager, viewContexts),
    send,
    worker
  )
}

const enum SegmentCollectionStatus {
  WaitingForInitialRecord,
  SegmentPending,
  Stopped,
}
type SegmentCollectionState =
  | {
      status: SegmentCollectionStatus.WaitingForInitialRecord
      nextSegmentCreationReason: CreationReason
    }
  | {
      status: SegmentCollectionStatus.SegmentPending
      segment: Segment
      expirationTimeoutId: TimeoutId
    }
  | {
      status: SegmentCollectionStatus.Stopped
    }

export function doStartSegmentCollection(
  lifeCycle: LifeCycle,
  getSegmentContext: () => SegmentContext | undefined,
  send: (data: Uint8Array, metadata: SegmentMetadata, rawSegmentSize: number) => void,
  worker: DeflateWorker,
  emitter: EventEmitter = window
) {
  let state: SegmentCollectionState = {
    status: SegmentCollectionStatus.WaitingForInitialRecord,
    nextSegmentCreationReason: 'init',
  }

  const { unsubscribe: unsubscribeViewCreated } = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, () => {
    flushSegment('view_change')
  })

  const { unsubscribe: unsubscribeBeforeUnload } = lifeCycle.subscribe(LifeCycleEventType.BEFORE_UNLOAD, () => {
    flushSegment('before_unload')
  })

  const { stop: unsubscribeVisibilityChange } = addEventListener(
    emitter,
    DOM_EVENT.VISIBILITY_CHANGE,
    () => {
      if (document.visibilityState === 'hidden') {
        flushSegment('visibility_hidden')
      }
    },
    { capture: true }
  )

  function flushSegment(nextSegmentCreationReason?: CreationReason) {
    if (state.status === SegmentCollectionStatus.SegmentPending) {
      state.segment.flush()
      clearTimeout(state.expirationTimeoutId)
    }

    if (nextSegmentCreationReason) {
      state = {
        status: SegmentCollectionStatus.WaitingForInitialRecord,
        nextSegmentCreationReason,
      }
    } else {
      state = {
        status: SegmentCollectionStatus.Stopped,
      }
    }
  }

  function createNewSegment(creationReason: CreationReason, initialRecord: Record) {
    const context = getSegmentContext()
    if (!context) {
      return
    }

    const segment = new Segment(
      worker,
      context,
      creationReason,
      initialRecord,
      (compressedSegmentSize) => {
        if (!segment.isFlushed && compressedSegmentSize > MAX_SEGMENT_SIZE) {
          flushSegment('max_size')
        }
      },
      (data, rawSegmentSize) => {
        send(data, segment.metadata, rawSegmentSize)
      }
    )

    state = {
      status: SegmentCollectionStatus.SegmentPending,
      segment,
      expirationTimeoutId: setTimeout(
        monitor(() => {
          flushSegment('max_duration')
        }),
        MAX_SEGMENT_DURATION
      ),
    }
  }

  return {
    addRecord: (record: Record) => {
      switch (state.status) {
        case SegmentCollectionStatus.WaitingForInitialRecord:
          createNewSegment(state.nextSegmentCreationReason, record)
          break

        case SegmentCollectionStatus.SegmentPending:
          state.segment.addRecord(record)
          break
      }
    },

    stop: () => {
      flushSegment()
      unsubscribeViewCreated()
      unsubscribeBeforeUnload()
      unsubscribeVisibilityChange()
    },
  }
}

export function computeSegmentContext(
  applicationId: string,
  sessionManager: RumSessionManager,
  viewContexts: ViewContexts
) {
  const session = sessionManager.findTrackedSession()
  const viewContext = viewContexts.findView()
  if (!session || !viewContext) {
    return undefined
  }
  return {
    application: {
      id: applicationId,
    },
    session: {
      id: session.id,
    },
    view: {
      id: viewContext.view.id,
    },
  }
}

export function setMaxSegmentSize(newSize: number = SEND_BEACON_BYTE_LENGTH_LIMIT) {
  MAX_SEGMENT_SIZE = newSize
}
