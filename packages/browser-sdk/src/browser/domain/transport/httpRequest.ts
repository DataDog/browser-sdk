export interface Payload {
  data: string | FormData | Blob
  bytesCount: number
  retry?: RetryInfo
  encoding?: 'deflate'
}

export interface RetryInfo {
  count: number
  lastFailureStatus: number
}

type TransportStatus = 'UP' | 'FAILURE_DETECTED' | 'DOWN'

export interface HttpRequestOptions {
  endpointUrl: string | (() => string)
  bytesLimit?: number
}

export interface HttpRequest {
  send(payload: Payload): void
  sendOnExit(payload: Payload): void
}

export const RECOMMENDED_BYTES_LIMIT = 16 * 1024 // 16 KiB

const MAX_ONGOING_BYTES = 80 * 1024 // 80 KiB
const MAX_ONGOING_REQUESTS = 32
const MAX_QUEUE_BYTES = 20 * 1024 * 1024 // 20 MiB
const INITIAL_BACKOFF_TIME = 1000 // 1 second
const MAX_BACKOFF_TIME = 60 * 1000 // 1 minute

export function createHttpRequest(options: HttpRequestOptions): HttpRequest {
  const bytesLimit = options.bytesLimit ?? RECOMMENDED_BYTES_LIMIT
  const resolveUrl =
    typeof options.endpointUrl === 'function' ? options.endpointUrl : () => options.endpointUrl as string

  // Retry state
  let transportStatus: TransportStatus = 'UP'
  let currentBackoff = INITIAL_BACKOFF_TIME

  // Bandwidth
  let ongoingRequestCount = 0
  let ongoingByteCount = 0

  // Queue
  const queue: Payload[] = []
  let queueBytesCount = 0

  function canSend(payload: Payload): boolean {
    return (
      ongoingRequestCount === 0 ||
      (ongoingByteCount + payload.bytesCount <= MAX_ONGOING_BYTES && ongoingRequestCount < MAX_ONGOING_REQUESTS)
    )
  }

  function shouldRetry(status: number): boolean {
    return (status === 0 && !navigator.onLine) || status === 408 || status === 429 || status >= 500
  }

  function fetchSend(payload: Payload, onDone: (status: number) => void) {
    fetch(resolveUrl(), { method: 'POST', body: payload.data, mode: 'cors' as RequestMode })
      .then((response) => onDone(response.status))
      .catch(() => onDone(0))
  }

  function enqueue(payload: Payload): boolean {
    if (queueBytesCount >= MAX_QUEUE_BYTES) {
      return false
    }
    queue.push(payload)
    queueBytesCount += payload.bytesCount
    return true
  }

  function dequeue(): Payload | undefined {
    const payload = queue.shift()
    if (payload) {
      queueBytesCount -= payload.bytesCount
    }
    return payload
  }

  function onSuccess(): void {
    transportStatus = 'UP'
    currentBackoff = INITIAL_BACKOFF_TIME
    retryQueued()
  }

  function onFailure(payload: Payload, status: number): void {
    payload.retry = {
      count: payload.retry ? payload.retry.count + 1 : 1,
      lastFailureStatus: status,
    }
    enqueue(payload)

    if (ongoingRequestCount > 0) {
      transportStatus = 'FAILURE_DETECTED'
    } else {
      transportStatus = 'DOWN'
      scheduleRetry()
    }
  }

  function scheduleRetry(): void {
    setTimeout(() => {
      const payload = queue[0]
      if (!payload) return

      ongoingRequestCount++
      ongoingByteCount += payload.bytesCount
      fetchSend(payload, (status) => {
        ongoingRequestCount--
        ongoingByteCount -= payload.bytesCount
        if (shouldRetry(status)) {
          dequeue() // remove the first item we just tried
          payload.retry = {
            count: payload.retry ? payload.retry.count + 1 : 1,
            lastFailureStatus: status,
          }
          enqueue(payload) // re-enqueue at end
          currentBackoff = Math.min(MAX_BACKOFF_TIME, currentBackoff * 2)
          scheduleRetry()
        } else {
          dequeue() // remove the successfully sent item
          transportStatus = 'UP'
          currentBackoff = INITIAL_BACKOFF_TIME
          retryQueued()
        }
      })
    }, currentBackoff)
  }

  function retryQueued(): void {
    const toRetry = queue.splice(0, queue.length)
    queueBytesCount = 0

    for (const payload of toRetry) {
      sendPayload(payload)
    }
  }

  function sendPayload(payload: Payload): void {
    if (transportStatus === 'UP' && canSend(payload)) {
      ongoingRequestCount++
      ongoingByteCount += payload.bytesCount
      fetchSend(payload, (status) => {
        ongoingRequestCount--
        ongoingByteCount -= payload.bytesCount
        if (shouldRetry(status)) {
          onFailure(payload, status)
        } else {
          onSuccess()
        }
      })
    } else {
      enqueue(payload)
    }
  }

  return {
    send(payload: Payload) {
      if (transportStatus === 'UP' && queue.length === 0 && canSend(payload)) {
        ongoingRequestCount++
        ongoingByteCount += payload.bytesCount
        fetchSend(payload, (status) => {
          ongoingRequestCount--
          ongoingByteCount -= payload.bytesCount
          if (shouldRetry(status)) {
            onFailure(payload, status)
          } else {
            onSuccess()
          }
        })
      } else {
        enqueue(payload)
      }
    },

    sendOnExit(payload: Payload) {
      const url = resolveUrl()
      if (payload.bytesCount < bytesLimit && navigator.sendBeacon) {
        try {
          const queued = navigator.sendBeacon(url, payload.data)
          if (queued) return
        } catch {
          // fall through to fetch
        }
      }
      fetch(url, { method: 'POST', body: payload.data, mode: 'cors' as RequestMode }).catch(() => {})
    },
  }
}
