import { SESSION_TIME_OUT_DELAY, relativeNow, HookNames } from '@datadog/browser-core'
import type { Hooks } from '../hooks'

export const URL_CONTEXT_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY

export interface UrlContext {
  url: string
  referrer: string
  [k: string]: unknown
}

let cachedUrlContext: UrlContext | undefined

export function cacheUrlContext(location: Location) {
  cachedUrlContext = buildUrlContext(location)
}

export function clearCachedUrlContext() {
  cachedUrlContext = undefined
}

export function startUrlContexts(hooks: Hooks, location: Location) {
  const date = relativeNow()
  hooks.register(HookNames.Assemble, ({ startTime }) => ({
    view: startTime > date ? buildUrlContext(location) : cachedUrlContext,
  }))
}

function buildUrlContext(location: Location): UrlContext {
  return {
    url: location.href,
    referrer: document.referrer,
  }
}
