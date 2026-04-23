import type { Page, Request } from '@playwright/test'

interface SalesforceRumEventView {
  url?: unknown
}

export interface SalesforceRumEvent {
  type?: unknown
  view?: SalesforceRumEventView
}

export interface SalesforceRumRegistry {
  rumRequests: Request[]
  rumEvents: SalesforceRumEvent[]
  rumViewEvents: SalesforceRumEvent[]
  findViewByPath: (pathname: string) => SalesforceRumEvent | undefined
  hasViewPath: (pathname: string) => boolean
  stop: () => void
}

export function createSalesforceRumRegistry(page: Page): SalesforceRumRegistry {
  const rumRequests: Request[] = []

  const onRequest = (request: Request) => {
    if (isRumIntakeRequest(request)) {
      rumRequests.push(request)
    }
  }

  page.context().on('request', onRequest)

  const registry: SalesforceRumRegistry = {
    get rumRequests() {
      return rumRequests
    },
    get rumEvents() {
      return rumRequests.flatMap((request) => getRumEvents(request))
    },
    get rumViewEvents() {
      return registry.rumEvents.filter((event) => event.type === 'view')
    },
    findViewByPath(pathname: string) {
      const expectedPath = normalizePathname(pathname)
      return registry.rumViewEvents.find((event) => normalizePathname(event.view?.url) === expectedPath)
    },
    hasViewPath(pathname: string) {
      return registry.findViewByPath(pathname) !== undefined
    },
    stop() {
      page.context().off('request', onRequest)
    },
  }

  return registry
}

function isRumIntakeRequest(request: Request) {
  return request.method() === 'POST' && isRumIntakeUrl(request.url())
}

function isRumIntakeUrl(candidate: string) {
  try {
    return new URL(candidate).pathname === '/api/v2/rum'
  } catch {
    return false
  }
}

function getRumEvents(request: Request): SalesforceRumEvent[] {
  const rawBody = request.postDataBuffer()?.toString('utf8') ?? ''

  if (!rawBody.trim()) {
    return []
  }

  return rawBody
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as SalesforceRumEvent]
      } catch {
        return []
      }
    })
}

function normalizePathname(candidate: unknown) {
  if (typeof candidate !== 'string' || !candidate.trim()) {
    return undefined
  }

  try {
    const pathname = new URL(candidate, 'https://example.org').pathname
    return pathname.endsWith('/') ? pathname.slice(0, -1) || '/' : pathname
  } catch {
    return undefined
  }
}
