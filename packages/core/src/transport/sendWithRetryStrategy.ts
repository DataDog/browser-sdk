import { addTelemetryDebug } from '../domain/telemetry'
import { monitor } from '../tools/monitor'
import { ONE_KIBI_BYTE, ONE_MEBI_BYTE, ONE_SECOND } from '../tools/utils'
import type { Payload, HttpResponse } from './httpRequest'

export const MAX_ONGOING_BYTES_COUNT = 80 * ONE_KIBI_BYTE
export const MAX_ONGOING_REQUESTS = 32
export const MAX_QUEUE_BYTES_COUNT = 3 * ONE_MEBI_BYTE
export const MAX_BACKOFF_TIME = 256 * ONE_SECOND
export const INITIAL_BACKOFF_TIME = ONE_SECOND

enum IntakeStatus {
  UP,
  ERROR_DETECTED,
  DOWN,
}

export interface RetryState {
  intakeStatus: IntakeStatus
  currentBackoffTime: number
  bandwidthMonitor: ReturnType<typeof newBandwidthMonitor>
  queuedPayloads: ReturnType<typeof newPayloadQueue>
}

type SendStrategy = (payload: Payload, onResponse: (r: HttpResponse) => void) => void

export function sendWithRetryStrategy(payload: Payload, state: RetryState, sendStrategy: SendStrategy) {
  if (
    state.intakeStatus === IntakeStatus.UP &&
    state.queuedPayloads.size() === 0 &&
    state.bandwidthMonitor.canHandle(payload)
  ) {
    send(payload, state, sendStrategy, {
      onSuccess: () => retryQueuedPayloads(state, sendStrategy),
      onFailure: () => {
        state.queuedPayloads.enqueue(payload)
        scheduleRetry(state, sendStrategy)
      },
    })
  } else {
    state.queuedPayloads.enqueue(payload)
  }
}

function scheduleRetry(state: RetryState, sendStrategy: SendStrategy) {
  if (state.intakeStatus !== IntakeStatus.DOWN) {
    return
  }
  setTimeout(
    monitor(() => {
      const payload = state.queuedPayloads.first()
      send(payload, state, sendStrategy, {
        onSuccess: () => {
          state.queuedPayloads.dequeue()
          addTelemetryDebug('resuming after intake failure', {
            currentBackoffTime: state.currentBackoffTime,
            queuedPayloadCount: state.queuedPayloads.size(),
            queuedPayloadBytesCount: state.queuedPayloads.bytesCount,
          })
          state.currentBackoffTime = INITIAL_BACKOFF_TIME
          retryQueuedPayloads(state, sendStrategy)
        },
        onFailure: () => {
          state.currentBackoffTime = Math.min(MAX_BACKOFF_TIME, state.currentBackoffTime * 2)
          scheduleRetry(state, sendStrategy)
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
      state.intakeStatus = IntakeStatus.UP
      onSuccess()
    } else {
      // do not consider intake down if another ongoing request could succeed
      state.intakeStatus =
        state.bandwidthMonitor.ongoingRequestCount > 0 ? IntakeStatus.ERROR_DETECTED : IntakeStatus.DOWN
      onFailure()
    }
  })
}

function retryQueuedPayloads(state: RetryState, sendStrategy: SendStrategy) {
  const pendingPayloads = []
  while (state.queuedPayloads.size() > 0) {
    pendingPayloads.push(state.queuedPayloads.dequeue()!)
  }
  pendingPayloads.map((payload) => sendWithRetryStrategy(payload, state, sendStrategy))
}

function wasRequestSuccessful(response: HttpResponse) {
  return response.status < 500
}

export function newRetryState(): RetryState {
  return {
    intakeStatus: IntakeStatus.UP,
    currentBackoffTime: INITIAL_BACKOFF_TIME,
    bandwidthMonitor: newBandwidthMonitor(),
    queuedPayloads: newPayloadQueue(),
  }
}

function newPayloadQueue() {
  const queue: Payload[] = []
  return {
    bytesCount: 0,
    enqueue(payload: Payload) {
      if (this.bytesCount >= MAX_QUEUE_BYTES_COUNT) {
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
