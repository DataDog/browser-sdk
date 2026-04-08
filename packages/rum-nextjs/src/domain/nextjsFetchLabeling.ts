import type { RumInitConfiguration, RumFetchResourceEventDomainContext } from '@datadog/browser-rum-core'
import { buildUrl } from '@datadog/browser-core'

// --- beforeSend wrapper ---

export function setupNextjsFetchLabeling(initConfiguration: RumInitConfiguration) {
  const originalBeforeSend = initConfiguration.beforeSend

  initConfiguration.beforeSend = (event, domainContext) => {
    if (event.type === 'resource') {
      labelNextjsFetch(event, domainContext)
    }

    if (originalBeforeSend) {
      return originalBeforeSend(event, domainContext)
    }
    return true
  }
}

function labelNextjsFetch(event: any, domainContext: any) {
  if (event.resource?.type !== 'fetch' || !('requestInit' in domainContext)) {
    return
  }

  const fetchContext = domainContext as RumFetchResourceEventDomainContext
  const actionHeader = getRequestHeader(fetchContext, 'next-action')

  if (actionHeader) {
    event.context = {
      ...event.context,
      nextjs: {
        requestType: 'server-action',
        actionId: actionHeader,
      },
    }
    return
  }

  const rscHeader = getRequestHeader(fetchContext, 'rsc')
  const prefetchHeader = getRequestHeader(fetchContext, 'next-router-prefetch')
  const url = typeof fetchContext.requestInput === 'string' ? fetchContext.requestInput : fetchContext.requestInput?.url
  const hasRscParam = url ? buildUrl(url, window.location.origin).searchParams.has('_rsc') : false

  if (prefetchHeader === '1') {
    event.context = { ...event.context, nextjs: { requestType: 'rsc-prefetch' } }
  } else if (rscHeader === '1' || hasRscParam) {
    event.context = { ...event.context, nextjs: { requestType: 'rsc-navigation', route: event.view?.name } }
  }
}

// --- Header extraction helpers ---

function getRequestHeader(context: RumFetchResourceEventDomainContext, name: string): string | undefined {
  // Try requestInput first (Request object)
  if (typeof context.requestInput === 'object' && 'headers' in context.requestInput) {
    const request = context.requestInput
    const value = request.headers.get(name)
    if (value) {
      return value
    }
  }

  // Try requestInit.headers
  const headers = context.requestInit?.headers
  if (!headers) {
    return undefined
  }

  // Headers instance
  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined
  }

  // Array of [key, value] pairs
  if (Array.isArray(headers)) {
    const entry = (headers as string[][]).find(([key]) => key.toLowerCase() === name.toLowerCase())
    return entry?.[1]
  }

  // Record<string, string>
  const record = headers
  // Case-insensitive lookup
  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === name.toLowerCase()) {
      return record[key]
    }
  }

  return undefined
}
