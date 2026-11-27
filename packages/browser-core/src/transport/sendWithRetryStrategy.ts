import { ONE_MINUTE, ONE_SECOND } from '@datadog/js-core/time'
import type { TrackType } from '@datadog/js-core/transport'
import { ONE_MEBI_BYTE, ONE_KIBI_BYTE, setTimeout } from '@datadog/js-core/util'
import type { Observable } from '@datadog/js-core/util'
import { isServerError } from '../tools/utils/responseUtils'
import type { Payload, HttpRequestEvent, HttpResponse, BandwidthStats } from './httpRequest'
import { RetryPolicy } from './retryPolicy'

export const MAX_ONGOING_BYTES_COUNT = 80 * ONE_KIBI_BYTE
export const MAX_ONGOING_REQUESTS = 32
export const MAX_QUEUE_BYTES_COUNT = 20 * ONE_MEBI_BYTE
export const MAX_BACKOFF_TIME = ONE_MINUTE
export const INITIAL_BACKOFF_TIME = ONE_SECOND

const enum TransportStatus {
  UP,
  FAILURE_DETECTED,
  DOWN,
}

const enum RetryReason {
  AFTER_SUCCESS,
  AFTER_RESUME,
}

export interface RetryState<Body extends Payload> {
  currentBackoffTime: number
  bandwidthMonitor: ReturnType<typeof newBandwidthMonitor>
  endpointResponded: boolean
  queuedPayloads: ReturnType<typeof newPayloadQueue<Body>>
  queueFullReported: boolean
  retryPolicy: RetryPolicy
  transportStatus: TransportStatus
}

type SendStrategy<Body extends Payload> = (payload: Body, onResponse: (r: HttpResponse) => void) => void

export function sendWithRetryStrategy<Body extends Payload>(
  payload: Body,
  state: RetryState<Body>,
  sendStrategy: SendStrategy<Body>,
  trackType: TrackType,
  reportError: (message: string) => void,
  requestObservable: Observable<HttpRequestEvent<Body>>
) {
  if (
    state.transportStatus === TransportStatus.UP &&
    state.queuedPayloads.size() === 0 &&
    state.bandwidthMonitor.canHandle(payload)
  ) {
    send(payload, state, sendStrategy, requestObservable, {
      onSuccess: () =>
        retryQueuedPayloads(RetryReason.AFTER_SUCCESS, state, sendStrategy, trackType, reportError, requestObservable),
      onFailure: () => {
        if (!state.queuedPayloads.enqueue(payload)) {
          requestObservable.notify({
            type: 'queue-full',
            bandwidth: state.bandwidthMonitor.stats(),
            endpointResponded: state.endpointResponded,
            payload,
          })
        }
        scheduleRetry(state, sendStrategy, trackType, reportError, requestObservable)
      },
    })
  } else {
    if (!state.queuedPayloads.enqueue(payload)) {
      requestObservable.notify({
        type: 'queue-full',
        bandwidth: state.bandwidthMonitor.stats(),
        endpointResponded: state.endpointResponded,
        payload,
      })
    }
  }
}

function scheduleRetry<Body extends Payload>(
  state: RetryState<Body>,
  sendStrategy: SendStrategy<Body>,
  trackType: TrackType,
  reportError: (message: string) => void,
  requestObservable: Observable<HttpRequestEvent<Body>>
) {
  if (state.transportStatus !== TransportStatus.DOWN) {
    return
  }
  setTimeout(() => {
    const payload = state.queuedPayloads.first()
    send(payload, state, sendStrategy, requestObservable, {
      onSuccess: () => {
        state.queuedPayloads.dequeue()
        state.currentBackoffTime = INITIAL_BACKOFF_TIME
        retryQueuedPayloads(RetryReason.AFTER_RESUME, state, sendStrategy, trackType, reportError, requestObservable)
      },
      onFailure: () => {
        state.currentBackoffTime = Math.min(MAX_BACKOFF_TIME, state.currentBackoffTime * 2)
        scheduleRetry(state, sendStrategy, trackType, reportError, requestObservable)
      },
    })
  }, state.currentBackoffTime)
}

function send<Body extends Payload>(
  payload: Body,
  state: RetryState<Body>,
  sendStrategy: SendStrategy<Body>,
  requestObservable: Observable<HttpRequestEvent<Body>>,
  { onSuccess, onFailure }: { onSuccess: () => void; onFailure: () => void }
) {
  state.bandwidthMonitor.add(payload)
  sendStrategy(payload, (response) => {
    state.bandwidthMonitor.remove(payload)
    state.endpointResponded ||= response.status !== 0
    if (!shouldRetryRequest(response, state.retryPolicy, state.endpointResponded)) {
      state.transportStatus = TransportStatus.UP
      requestObservable.notify({
        type: 'success',
        bandwidth: state.bandwidthMonitor.stats(),
        endpointResponded: state.endpointResponded,
        payload,
      })
      onSuccess()
    } else {
      // do not consider transport down if another ongoing request could succeed
      state.transportStatus =
        state.bandwidthMonitor.ongoingRequestCount > 0 ? TransportStatus.FAILURE_DETECTED : TransportStatus.DOWN
      payload.retry = {
        count: payload.retry ? payload.retry.count + 1 : 1,
        lastFailureStatus: response.status,
      }
      requestObservable.notify({
        type: 'failure',
        bandwidth: state.bandwidthMonitor.stats(),
        endpointResponded: state.endpointResponded,
        payload,
      })
      onFailure()
    }
  })
}

function retryQueuedPayloads<Body extends Payload>(
  reason: RetryReason,
  state: RetryState<Body>,
  sendStrategy: SendStrategy<Body>,
  trackType: TrackType,
  reportError: (message: string) => void,
  requestObservable: Observable<HttpRequestEvent<Body>>
) {
  if (reason === RetryReason.AFTER_SUCCESS && state.queuedPayloads.isFull() && !state.queueFullReported) {
    reportError(`Reached max ${trackType} events size queued for upload: ${MAX_QUEUE_BYTES_COUNT / ONE_MEBI_BYTE}MiB`)
    state.queueFullReported = true
  }
  const previousQueue = state.queuedPayloads
  state.queuedPayloads = newPayloadQueue()
  while (previousQueue.size() > 0) {
    sendWithRetryStrategy(previousQueue.dequeue()!, state, sendStrategy, trackType, reportError, requestObservable)
  }
}

function shouldRetryRequest(response: HttpResponse, retryPolicy: RetryPolicy, endpointResponded: boolean): boolean {
  return (
    response.type !== 'opaque' &&
    ((response.status === 0 && shouldRetryForStatus0Response(retryPolicy, endpointResponded)) ||
      response.status === 408 ||
      response.status === 429 ||
      isServerError(response.status))
  )
}

function shouldRetryForStatus0Response(retryPolicy: RetryPolicy, endpointResponded: boolean): boolean {
  return !navigator.onLine || (retryPolicy === RetryPolicy.MINIMIZE_DATA_LOSS && endpointResponded)
}

export function newRetryState<Body extends Payload>(retryPolicy: RetryPolicy): RetryState<Body> {
  return {
    bandwidthMonitor: newBandwidthMonitor(),
    currentBackoffTime: INITIAL_BACKOFF_TIME,
    endpointResponded: false,
    queuedPayloads: newPayloadQueue(),
    queueFullReported: false,
    retryPolicy,
    transportStatus: TransportStatus.UP,
  }
}

function newPayloadQueue<Body extends Payload>() {
  const queue: Body[] = []
  return {
    bytesCount: 0,
    enqueue(payload: Body) {
      if (this.isFull()) {
        return false
      }
      queue.push(payload)
      this.bytesCount += payload.bytesCount
      return true
    },
    first() {
      return queue[0]
    },
    dequeue() {
      const payload = queue.shift()
      if (payload) {
        this.bytesCount -= payload.bytesCount
      }
      return payload
    },
    size() {
      return queue.length
    },
    isFull() {
      return this.bytesCount >= MAX_QUEUE_BYTES_COUNT
    },
  }
}

function newBandwidthMonitor() {
  return {
    ongoingRequestCount: 0,
    ongoingByteCount: 0,
    canHandle(payload: Payload) {
      return (
        this.ongoingRequestCount === 0 ||
        (this.ongoingByteCount + payload.bytesCount <= MAX_ONGOING_BYTES_COUNT &&
          this.ongoingRequestCount < MAX_ONGOING_REQUESTS)
      )
    },
    add(payload: Payload) {
      this.ongoingRequestCount += 1
      this.ongoingByteCount += payload.bytesCount
    },
    remove(payload: Payload) {
      this.ongoingRequestCount -= 1
      this.ongoingByteCount -= payload.bytesCount
    },
    stats(): BandwidthStats {
      return {
        ongoingByteCount: this.ongoingByteCount,
        ongoingRequestCount: this.ongoingRequestCount,
      }
    },
  }
}
