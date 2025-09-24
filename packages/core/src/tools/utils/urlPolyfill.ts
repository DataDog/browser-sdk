import { globalObject } from '../globalObject'

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
  const { URL } = getPristineWindow()

  try {
    return base !== undefined ? new URL(url, base) : new URL(url)
  } catch (error) {
    throw new Error(`Failed to construct URL: ${String(error)}`)
  }
}

/**
 * Get native URL constructor from a clean iframe
 * This avoids polyfill issues by getting the native implementation from a fresh iframe context
 * Falls back to the original URL constructor if iframe approach fails
 */
let getPristineGlobalObjectCache: Pick<typeof window, 'URL'> | undefined

export function getPristineWindow() {
  if (!getPristineGlobalObjectCache) {
    let iframe: HTMLIFrameElement | undefined
    let pristineWindow: Window & typeof globalThis
    try {
      iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      document.body.appendChild(iframe)
      pristineWindow = iframe.contentWindow as Window & typeof globalThis
    } catch {
      pristineWindow = globalObject as unknown as Window & typeof globalThis
    }
    getPristineGlobalObjectCache = {
      URL: pristineWindow.URL,
    }
    iframe?.remove()
  }

  return getPristineGlobalObjectCache
}
