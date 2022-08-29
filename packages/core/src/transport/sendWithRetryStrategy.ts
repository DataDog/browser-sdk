import { addTelemetryDebug } from '../domain/telemetry'
import { monitor } from '../tools/monitor'
import { ONE_KILO_BYTE, ONE_MEGA_BYTE, ONE_SECOND } from '../tools/utils'
import type { Payload, HttpResponse } from './httpRequest'

export const MAX_ONGOING_BYTES_COUNT = 80 * ONE_KILO_BYTE
export const MAX_ONGOING_REQUESTS = 32
export const MAX_QUEUE_BYTES_COUNT = 3 * ONE_MEGA_BYTE
export const MAX_BACKOFF_TIME = 256 * ONE_SECOND

export interface RetryState {
  isIntakeAvailable: boolean
  currentBackoffTime: number
  bandwidthMonitor: ReturnType<typeof newBandwidthMonitor>
  queuedPayloads: ReturnType<typeof newPayloadQueue>
}

type SendStrategy = (payload: Payload, onResponse: (r: HttpResponse) => void) => void

export function sendWithRetryStrategy(payload: Payload, state: RetryState, sendStrategy: SendStrategy) {
  if (state.isIntakeAvailable && state.bandwidthMonitor.canHandle(payload)) {
    send(payload, state, sendStrategy, {
      onSuccess: () => sendNextPayload(state, sendStrategy),
      onFailure: () => {
        state.queuedPayloads.enqueue(payload)
        scheduleRetry(state, sendStrategy)
      },
    })
    sendNextPayload(state, sendStrategy)
  } else {
    state.queuedPayloads.enqueue(payload)
  }
}

function scheduleRetry(state: RetryState, sendStrategy: SendStrategy) {
  if (state.bandwidthMonitor.ongoingRequestCount !== 0) {
    // avoid to enter a retry phase if another ongoing request can succeed
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
          state.currentBackoffTime = ONE_SECOND
          sendNextPayload(state, sendStrategy)
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

function sendNextPayload(state: RetryState, sendStrategy: SendStrategy) {
  const nextPayload = state.queuedPayloads.dequeue()
  if (nextPayload) {
    sendWithRetryStrategy(nextPayload, state, sendStrategy)
  }
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
      state.isIntakeAvailable = true
      onSuccess()
    } else {
      state.isIntakeAvailable = false
      onFailure()
    }
  })
}

function wasRequestSuccessful(response: HttpResponse) {
  return response.status < 500
}

export function newRetryState(): RetryState {
  return {
    isIntakeAvailable: true,
    currentBackoffTime: ONE_SECOND,
    bandwidthMonitor: newBandwidthMonitor(),
    queuedPayloads: newPayloadQueue(),
  }
}

function newPayloadQueue() {
  const queue: Payload[] = []
  return {
    bytesCount: 0,
    enqueue(payload: Payload) {
      if (payload.bytesCount > MAX_QUEUE_BYTES_COUNT) {
        return
      }
      while (payload.bytesCount + this.bytesCount > MAX_QUEUE_BYTES_COUNT) {
        this.dequeue()
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
