import { jsonStringify } from '../serialisation/jsonStringify'

export function normalizeUrl(url: string) {
  return buildUrl(url, location.href).href
}

export function isValidUrl(url: string) {
  try {
    return !!buildUrl(url)
  } catch {
    return false
  }
}

export function getPathName(url: string) {
  const pathname = buildUrl(url).pathname
  return pathname[0] === '/' ? pathname : `/${pathname}`
}

export function buildUrl(url: string, base?: string) {
  const nativeURL = getNativeURL()
  const URLConstructor = nativeURL || URL

  try {
    return base !== undefined ? new URLConstructor(url, base) : new URLConstructor(url)
  } catch (error) {
    throw new Error(`Failed to construct URL: ${String(error)} ${jsonStringify({ url, base })!}`)
  }
}

/**
 * Get native URL constructor from a clean iframe
 * This avoids polyfill issues by getting the native implementation from a fresh iframe context
 * Falls back to the original URL constructor if iframe approach fails
 */
let cachedNativeURL: typeof URL | undefined
export function getNativeURL(): typeof URL | undefined {
  if (cachedNativeURL !== undefined) {
    return cachedNativeURL
  }
  try {
    const iframe = document.createElement('iframe')
    document.body.appendChild(iframe)

    const iframeWindow = iframe.contentWindow
    if (iframeWindow && (iframeWindow as any).URL) {
      const iframeURL = (iframeWindow as any).URL as typeof URL
      const testURL = new iframeURL('http://test.com')
      if (testURL.href === 'http://test.com/') {
        cachedNativeURL = iframeURL
      }
    }

    document.body.removeChild(iframe)
  } catch {
    // If iframe approach fails, we'll use the original URL constructor
  }

  return cachedNativeURL
}
