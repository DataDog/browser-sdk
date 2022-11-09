import type { HttpRequest, TimeoutId } from '@datadog/browser-core'
import { isExperimentalFeatureEnabled, ONE_SECOND, monitor } from '@datadog/browser-core'
import type { LifeCycle, ViewContexts, RumSessionManager } from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'
import type { BrowserRecord, CreationReason, SegmentContext } from '../../types'
import type { DeflateWorker } from './deflateWorker'
import { buildReplayPayload } from './buildReplayPayload'
import type { FlushReason } from './segment'
import { Segment } from './segment'

export const SEGMENT_DURATION_LIMIT = 30 * ONE_SECOND
/**
 * beacon payload max queue size implementation is 64kb
 * ensure that we leave room for logs, rum and potential other users
 */
export let SEGMENT_BYTES_LIMIT = 60_000

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
// * the encoded segment bytes count reaches a limit
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
  httpRequest: HttpRequest,
  worker: DeflateWorker
) {
  return doStartSegmentCollection(
    lifeCycle,
    () => computeSegmentContext(applicationId, sessionManager, viewContexts),
    httpRequest,
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
  httpRequest: HttpRequest,
  worker: DeflateWorker
) {
  let state: SegmentCollectionState = {
    status: SegmentCollectionStatus.WaitingForInitialRecord,
    nextSegmentCreationReason: 'init',
  }

  const { unsubscribe: unsubscribeViewCreated } = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, () => {
    flushSegment('view_change')
  })

  const { unsubscribe: unsubscribePageExited } = lifeCycle.subscribe(
    LifeCycleEventType.PAGE_EXITED,
    (pageExitEvent) => {
      flushSegment(pageExitEvent.reason)
    }
  )

  function flushSegment(flushReason: FlushReason) {
    if (state.status === SegmentCollectionStatus.SegmentPending) {
      state.segment.flush(flushReason)
      clearTimeout(state.expirationTimeoutId)
    }

    if (flushReason !== 'stop') {
      state = {
        status: SegmentCollectionStatus.WaitingForInitialRecord,
        nextSegmentCreationReason: flushReason,
      }
    } else {
      state = {
        status: SegmentCollectionStatus.Stopped,
      }
    }
  }

  function createNewSegment(creationReason: CreationReason, initialRecord: BrowserRecord) {
    const context = getSegmentContext()
    if (!context) {
      return
    }

    const segment = new Segment(
      worker,
      context,
      creationReason,
      initialRecord,
      (compressedSegmentBytesCount) => {
        if (!segment.flushReason && compressedSegmentBytesCount > SEGMENT_BYTES_LIMIT) {
          flushSegment('segment_bytes_limit')
        }
      },
      (data, rawSegmentBytesCount) => {
        const payload = buildReplayPayload(data, segment.metadata, rawSegmentBytesCount)
        if (
          !isExperimentalFeatureEnabled('retry_replay') ||
          segment.flushReason === 'visibility_hidden' ||
          segment.flushReason === 'before_unload'
        ) {
          httpRequest.sendOnExit(payload)
        } else {
          httpRequest.send(payload)
        }
      }
    )

    state = {
      status: SegmentCollectionStatus.SegmentPending,
      segment,
      expirationTimeoutId: setTimeout(
        monitor(() => {
          flushSegment('segment_duration_limit')
        }),
        SEGMENT_DURATION_LIMIT
      ),
    }
  }

  return {
    addRecord: (record: BrowserRecord) => {
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
      flushSegment('stop')
      unsubscribeViewCreated()
      unsubscribePageExited()
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
      id: viewContext.id,
    },
  }
}

export function setSegmentBytesLimit(newSegmentBytesLimit = 60_000) {
  SEGMENT_BYTES_LIMIT = newSegmentBytesLimit
}
