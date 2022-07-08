import type { TimeoutId } from '../tools/utils'
import { ONE_SECOND } from '../tools/utils'
import type { Observable } from '../tools/observable'
import { monitor } from '../tools/monitor'

const MIN_RETRY_INTERVAL = ONE_SECOND
const MAX_RETRY_INTERVAL = 8 * ONE_SECOND

export function httpRetry(
  send: (data: string | FormData, bytesCount: number) => Observable<Response>,
  configuration: {
    bufferBytesLimit: number
    ongoingBytesLimit: number
    ongoingRequestsLimit: number
  }
) {
  const buffer: Array<{ data: string | FormData; bytesCount: number }> = []

  let isIntakeAvailable = true
  let scheduleRetryTimeoutId: TimeoutId
  let retryInterval = MIN_RETRY_INTERVAL

  const throttling = httpThrottling(() => flush(), configuration)

  /**
   * Schedule the task to "detect" the intake availability
   */
  function scheduleRetry() {
    if (scheduleRetryTimeoutId) clearTimeout(scheduleRetryTimeoutId)

    scheduleRetryTimeoutId = window.setTimeout(
      monitor(() => detectIntakeAvailability()),
      retryInterval
    )
  }

  /**
   * Send a request and check the response to see if the intake is available
   */
  function detectIntakeAvailability() {
    const { data, bytesCount } = buffer.shift()!

    send(data, bytesCount).subscribe((response) => {
      if (isFailedRequest(response)) {
        buffer.unshift({ data, bytesCount })
        if (retryInterval < MAX_RETRY_INTERVAL) {
          retryInterval *= 2
        }
        scheduleRetry()
      } else {
        isIntakeAvailable = true
        retryInterval = MIN_RETRY_INTERVAL
        flush()
      }
    })
  }

  /**
   * Exposed sending method for the batch.
   * Check if the intake is available and throttling limits are okay
   * Check the response of the request to see if the intake is still available
   * If not schedule a retry
   */
  function retried(data: string | FormData, bytesCount: number): void {
    if (!isIntakeAvailable || throttling.isLimitReached()) {
      buffer.push({ data, bytesCount })
      return
    }

    const observable = send(data, bytesCount)

    throttling.trackRequest(observable, bytesCount)

    observable.subscribe((response) => {
      if (isFailedRequest(response)) {
        buffer.push({ data, bytesCount })
        scheduleRetry()
        isIntakeAvailable = false
      }
    })
  }

  function flush() {
    let request = buffer.shift()
    while (request) {
      retried(request.data, request.bytesCount)
      request = buffer.shift()
    }
  }

  return {
    send: retried,
  }
}

function httpThrottling(
  onLimitReleased: () => void,
  configuration: {
    ongoingBytesLimit: number
    ongoingRequestsLimit: number
  }
) {
  const ongoingRequests = new Set<Observable<Response>>()

  let ongoingBytesCount = 0
  let isLimitReached = false

  return {
    isLimitReached() {
      if (
        ongoingRequests.size >= configuration.ongoingRequestsLimit ||
        ongoingBytesCount > configuration.ongoingBytesLimit
      ) {
        isLimitReached = true
      }

      return isLimitReached
    },
    trackRequest(request: Observable<Response>, bytesCount: number) {
      ongoingBytesCount += bytesCount
      ongoingRequests.add(request)
      request.subscribe(() => {
        ongoingRequests.delete(request)
        ongoingBytesCount -= bytesCount

        if (isLimitReached) {
          isLimitReached = false
          onLimitReleased()
        }
      })
    },
  }
}
