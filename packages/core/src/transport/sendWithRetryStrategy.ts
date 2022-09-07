import { addTelemetryDebug } from '../domain/telemetry'
import type { EndpointType } from '../domain/configuration'
import { monitor } from '../tools/monitor'
import type { RawError } from '../tools/error'
import { clocksNow } from '../tools/timeUtils'
import { ONE_KIBI_BYTE, ONE_MEBI_BYTE, ONE_SECOND, ONE_MINUTE } from '../tools/utils'
import { ErrorSource } from '../tools/error'
import type { Payload, HttpResponse } from './httpRequest'

export const MAX_ONGOING_BYTES_COUNT = 80 * ONE_KIBI_BYTE
export const MAX_ONGOING_REQUESTS = 32
export const MAX_QUEUE_BYTES_COUNT = 3 * ONE_MEBI_BYTE
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

export interface RetryState {
  transportStatus: TransportStatus
  lastFailureStatus: number
  currentBackoffTime: number
  bandwidthMonitor: ReturnType<typeof newBandwidthMonitor>
  queuedPayloads: ReturnType<typeof newPayloadQueue>
  queueFullReported: boolean
}

type SendStrategy = (payload: Payload, onResponse: (r: HttpResponse) => void) => void

export function sendWithRetryStrategy(
  payload: Payload,
  state: RetryState,
  sendStrategy: SendStrategy,
  endpointType: EndpointType,
  reportError: (error: RawError) => void
) {
  if (
    state.transportStatus === TransportStatus.UP &&
    state.queuedPayloads.size() === 0 &&
    state.bandwidthMonitor.canHandle(payload)
  ) {
    send(payload, state, sendStrategy, {
      onSuccess: () => retryQueuedPayloads(RetryReason.AFTER_SUCCESS, state, sendStrategy, endpointType, reportError),
      onFailure: () => {
        state.queuedPayloads.enqueue(payload)
        scheduleRetry(state, sendStrategy, endpointType, reportError)
      },
    })
  } else {
    state.queuedPayloads.enqueue(payload)
  }
}

function scheduleRetry(
  state: RetryState,
  sendStrategy: SendStrategy,
  endpointType: EndpointType,
  reportError: (error: RawError) => void
) {
  if (state.transportStatus !== TransportStatus.DOWN) {
    return
  }
  setTimeout(
    monitor(() => {
      const payload = state.queuedPayloads.first()
      send(payload, state, sendStrategy, {
        onSuccess: () => {
          state.queuedPayloads.dequeue()
          if (state.lastFailureStatus !== 0) {
            addTelemetryDebug('resuming after transport down', {
              failureStatus: state.lastFailureStatus,
            })
          }
          state.currentBackoffTime = INITIAL_BACKOFF_TIME
          retryQueuedPayloads(RetryReason.AFTER_RESUME, state, sendStrategy, endpointType, reportError)
        },
        onFailure: () => {
          state.currentBackoffTime = Math.min(MAX_BACKOFF_TIME, state.currentBackoffTime * 2)
          scheduleRetry(state, sendStrategy, endpointType, reportError)
        },
      })
    }),
    state.currentBackoffTime
  )
}

function send(
  payload: Payload,
  state: RetryState,
  sendStrategy: SendStrategy,
  { onSuccess, onFailure }: { onSuccess: () => void; onFailure: () => void }
) {
  state.bandwidthMonitor.add(payload)
  sendStrategy(payload, (response) => {
    state.bandwidthMonitor.remove(payload)
    if (wasRequestSuccessful(response)) {
      state.transportStatus = TransportStatus.UP
      onSuccess()
    } else {
      // do not consider transport down if another ongoing request could succeed
      state.transportStatus =
        state.bandwidthMonitor.ongoingRequestCount > 0 ? TransportStatus.FAILURE_DETECTED : TransportStatus.DOWN
      state.lastFailureStatus = response.status
      onFailure()
    }
  })
}

function retryQueuedPayloads(
  reason: RetryReason,
  state: RetryState,
  sendStrategy: SendStrategy,
  endpointType: EndpointType,
  reportError: (error: RawError) => void
) {
  if (reason === RetryReason.AFTER_SUCCESS && state.queuedPayloads.isFull() && !state.queueFullReported) {
    reportError({
      message: `Reached max ${endpointType} events size queued for upload: ${MAX_QUEUE_BYTES_COUNT / ONE_MEBI_BYTE}MiB`,
      source: ErrorSource.AGENT,
      startClocks: clocksNow(),
    })
    state.queueFullReported = true
  }
  const previousQueue = state.queuedPayloads
  state.queuedPayloads = newPayloadQueue()
  while (previousQueue.size() > 0) {
    sendWithRetryStrategy(previousQueue.dequeue()!, state, sendStrategy, endpointType, reportError)
  }
}

function wasRequestSuccessful(response: HttpResponse) {
  return response.status !== 0 && response.status !== 429 && response.status < 500
}

export function newRetryState(): RetryState {
  return {
    transportStatus: TransportStatus.UP,
    lastFailureStatus: 0,
    currentBackoffTime: INITIAL_BACKOFF_TIME,
    bandwidthMonitor: newBandwidthMonitor(),
    queuedPayloads: newPayloadQueue(),
    queueFullReported: false,
  }
}

function newPayloadQueue() {
  const queue: Payload[] = []
  return {
    bytesCount: 0,
    enqueue(payload: Payload) {
      if (this.isFull()) {
        return
      }
      queue.push(payload)
      this.bytesCount += payload.bytesCount
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
  }
}
