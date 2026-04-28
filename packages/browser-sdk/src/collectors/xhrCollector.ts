import type { Pipeline, NetworkRequestResource } from '@datadog/core-next'
import { createIdentifier, makeTracingHeaders, findTracingOption, isSampled } from '@datadog/core-next'
import type { Identifier } from '@datadog/core-next'
import { isIntakeUrl } from '../browser'
import type { CollectorTracingConfig } from './fetchCollector'

function startXhrCollection(
  pipeline: Pipeline<Record<string, unknown>>,
  tracingConfig?: CollectorTracingConfig
): () => void {
  const originalOpen = XMLHttpRequest.prototype.open
  const originalSend = XMLHttpRequest.prototype.send

  XMLHttpRequest.prototype.open = function (method: string, url: string | URL) {
    ;(this as any)._dd_method = method
    ;(this as any)._dd_url = String(url)
    ;(this as any)._dd_startTime = performance.now()
    ;(this as any)._dd_startDate = Date.now()
    return originalOpen.apply(this, arguments as any)
  }

  XMLHttpRequest.prototype.send = function () {
    const xhr = this
    const url: string = (xhr as any)._dd_url ?? ''
    const method: string = (xhr as any)._dd_method ?? 'GET'

    let traceId: Identifier | undefined
    let spanId: Identifier | undefined

    if (tracingConfig && !isIntakeUrl(url)) {
      const option = findTracingOption(url, tracingConfig.tracingOptions)
      if (option) {
        const sampled = isSampled(tracingConfig.sessionId, tracingConfig.traceSampleRate)
        if (sampled || tracingConfig.traceContextInjection === 'all') {
          traceId = createIdentifier(64)
          spanId = createIdentifier(63)
          const headers = makeTracingHeaders(traceId, spanId, sampled, option.propagatorTypes)
          for (const [name, value] of Object.entries(headers)) {
            xhr.setRequestHeader(name, value)
          }
        }
      }
    }

    ;(xhr as any)._dd_traceId = traceId
    ;(xhr as any)._dd_spanId = spanId

    const onComplete = () => {
      if (!isIntakeUrl(url)) {
        const startTime: number = (xhr as any)._dd_startTime ?? performance.now()
        const startDate: number = (xhr as any)._dd_startDate ?? Date.now()
        const duration = performance.now() - startTime
        const resource: NetworkRequestResource = {
          method,
          url,
          status: xhr.status,
          isAborted: xhr.status === 0 && xhr.readyState !== 4,
          startTime,
          startDate,
          duration,
          traceId: (xhr as any)._dd_traceId,
          spanId: (xhr as any)._dd_spanId,
        }
        pipeline.publish('resource:network_request', resource)
      }
      xhr.removeEventListener('loadend', onComplete)
    }

    xhr.addEventListener('loadend', onComplete)

    if (!isIntakeUrl(url)) {
      pipeline.publish('signal:network_request_start', { url, method })
    }

    return originalSend.apply(this, arguments as any)
  }

  return () => {
    XMLHttpRequest.prototype.open = originalOpen
    XMLHttpRequest.prototype.send = originalSend
  }
}

export { startXhrCollection }
