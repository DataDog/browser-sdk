import { getZoneJsOriginalValue } from '../tools/getZoneJsOriginalValue'
import { globalObject } from '../tools/globalObject'

/**
 * Make a fetch request using the native implementation, bypassing Zone.js patching.
 * This prevents unnecessary Angular change detection cycles.
 *
 * @param input - The resource to fetch (URL or Request object)
 * @param init - Optional fetch options
 * @returns A Promise that resolves to the Response
 */
export function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return getZoneJsOriginalValue(globalObject, 'fetch')(input, init)
}
