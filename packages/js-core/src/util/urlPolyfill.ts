import type { GlobalObject } from './globalObject'
import { globalObject } from './globalObject'

/**
 * Resolves a URL, returning a normalized absolute URL string.
 *
 * Document-relative inputs are resolved against `document.baseURI` (the `<base href>`, defaulting to
 * the document location) to match how the browser resolves relative request URLs — so the URL
 * recorded for a fetch/XHR matches the one actually requested. Falls back to `location.href` in
 * environments without a document (workers, SSR). Absolute and root-relative inputs ignore the base
 * and are unaffected.
 */
export function normalizeUrl(url: string) {
  return buildUrl(url, globalObject.document?.baseURI ?? globalObject.location?.href).href
}

/** Returns true if the given string is a valid URL. */
export function isValidUrl(url: string) {
  try {
    return !!buildUrl(url)
  } catch {
    return false
  }
}

/** Extracts the pathname from a URL, ensuring it starts with `/`. */
export function getPathName(url: string) {
  const pathname = buildUrl(url).pathname
  return pathname[0] === '/' ? pathname : `/${pathname}`
}

/** Constructs a URL object, using the native URL constructor from a pristine iframe to avoid polyfill interference. */
export function buildUrl(url: string, base?: string) {
  const { URL } = getPristineWindow()

  try {
    return base !== undefined ? new URL(url, base) : new URL(url)
  } catch (error) {
    throw new Error(`Failed to construct URL: ${String(error)}`)
  }
}

let getPristineGlobalObjectCache: Pick<typeof window, 'URL'> | undefined

/**
 * Returns a `{ URL }` object sourced from a pristine iframe, bypassing any patched URL constructor.
 * Falls back to the current global if iframe creation fails.
 */
export function getPristineWindow() {
  if (!getPristineGlobalObjectCache) {
    let iframe: HTMLIFrameElement | undefined
    let pristineWindow: GlobalObject
    try {
      iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      document.body.appendChild(iframe)
      pristineWindow = (iframe.contentWindow as GlobalObject | null) ?? globalObject
    } catch {
      pristineWindow = globalObject
    }
    getPristineGlobalObjectCache = {
      URL: pristineWindow.URL,
    }
    iframe?.remove()
  }

  return getPristineGlobalObjectCache
}
