import type { Pipeline, NetworkRequestResource } from '@datadog/core-next'

function startXhrCollection(pipeline: Pipeline<Record<string, unknown>>): () => void {
  const originalOpen = XMLHttpRequest.prototype.open
  const originalSend = XMLHttpRequest.prototype.send

  XMLHttpRequest.prototype.open = function (method: string, url: string | URL) {
    ;(this as any)._dd_method = method
    ;(this as any)._dd_url = String(url)
    ;(this as any)._dd_startTime = Date.now()
    return originalOpen.apply(this, arguments as any)
  }

  XMLHttpRequest.prototype.send = function () {
    const xhr = this

    const onComplete = () => {
      const duration = Date.now() - ((xhr as any)._dd_startTime ?? Date.now())
      const resource: NetworkRequestResource = {
        method: (xhr as any)._dd_method ?? 'GET',
        url: (xhr as any)._dd_url ?? '',
        status: xhr.status,
        isAborted: xhr.status === 0 && xhr.readyState !== 4,
        duration,
      }
      pipeline.publish('resource:network_request', resource)
      xhr.removeEventListener('loadend', onComplete)
    }

    xhr.addEventListener('loadend', onComplete)
    return originalSend.apply(this, arguments as any)
  }

  return () => {
    XMLHttpRequest.prototype.open = originalOpen
    XMLHttpRequest.prototype.send = originalSend
  }
}

export { startXhrCollection }
