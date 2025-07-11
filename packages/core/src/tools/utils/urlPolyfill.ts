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
  const URLConstructor = getNativeURL()

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
export function getNativeURL(): typeof URL {
  if (cachedNativeURL !== undefined) {
    return cachedNativeURL
  }

  let iframe: HTMLIFrameElement | undefined
  try {
    iframe = document.createElement('iframe')
    iframe.style.display = 'none'
    document.body.appendChild(iframe)

    const iframeWindow = iframe.contentWindow
    if (iframeWindow && (iframeWindow as any).URL) {
      const iframeURL = (iframeWindow as any).URL as typeof URL
      const testURL = new iframeURL('http://test.com')
      if (testURL.href === 'http://test.com/') {
        cachedNativeURL = iframeURL
      }
    }
  } catch {
    // If iframe approach fails, we'll use the original URL constructor
    cachedNativeURL = URL
  } finally {
    if (iframe && iframe.parentNode) {
      document.body.removeChild(iframe)
    }
  }

  if (!cachedNativeURL) {
    cachedNativeURL = URL
  }

  return cachedNativeURL
}
