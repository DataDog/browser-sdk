import { getGlobalObject } from './globalObject'
import { getZoneJsOriginalValue } from './getZoneJsOriginalValue'

/**
 * Calls window.fetch, bypassing Zone.js patching if present.
 * Zone.js (used by Angular) patches window.fetch which can cause issues
 * like unnecessary change detection cycles. We use the original value.
 */
export function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return getZoneJsOriginalValue(getGlobalObject(), 'fetch')(input, init)
}

/**
 * Calls navigator.sendBeacon.
 */
export function sendBeacon(url: string, data?: BodyInit | null): boolean {
  return navigator.sendBeacon(url, data)
}
