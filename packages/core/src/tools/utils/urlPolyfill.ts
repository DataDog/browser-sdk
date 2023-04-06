import { jsonStringify } from '../serialisation/jsonStringify'

export function normalizeUrl(url: string) {
  return buildUrl(url, getLocationOrigin()).href
}

export function isValidUrl(url: string) {
  try {
    return !!buildUrl(url)
  } catch {
    return false
  }
}

export function haveSameOrigin(url1: string, url2: string) {
  return getOrigin(url1) === getOrigin(url2)
}

export function getOrigin(url: string) {
  return getLinkElementOrigin(buildUrl(url))
}

export function getPathName(url: string) {
  const pathname = buildUrl(url).pathname
  return pathname[0] === '/' ? pathname : `/${pathname}`
}

export function getSearch(url: string) {
  return buildUrl(url).search
}

export function getHash(url: string) {
  return buildUrl(url).hash
}

export function buildUrl(url: string, base?: string) {
  const supportedURL = getSupportedUrl()
  if (supportedURL) {
    try {
      return base !== undefined ? new supportedURL(url, base) : new supportedURL(url)
    } catch (error) {
      throw new Error(
        `Failed to construct URL. ${jsonStringify({ url, base, error: error instanceof Error ? error.message : '' })!}`
      )
    }
  }
  if (base === undefined && !/:/.test(url)) {
    throw new Error(`Invalid URL: '${url}'`)
  }
  let doc = document
  const anchorElement = doc.createElement('a')
  if (base !== undefined) {
    doc = document.implementation.createHTMLDocument('')
    const baseElement = doc.createElement('base')
    baseElement.href = base
    doc.head.appendChild(baseElement)
    doc.body.appendChild(anchorElement)
  }
  anchorElement.href = url
  return anchorElement
}

const originalURL = URL
let isURLSupported: boolean | undefined
function getSupportedUrl(): typeof URL | undefined {
  if (isURLSupported === undefined) {
    try {
      const url = new originalURL('http://test/path')
      isURLSupported = url.href === 'http://test/path'
    } catch {
      isURLSupported = false
    }
  }
  return isURLSupported ? originalURL : undefined
}

export function getLocationOrigin() {
  return getLinkElementOrigin(window.location)
}

/**
 * IE fallback
 * https://developer.mozilla.org/en-US/docs/Web/API/HTMLHyperlinkElementUtils/origin
 */
export function getLinkElementOrigin(element: Location | HTMLAnchorElement | URL) {
  if (element.origin) {
    return element.origin
  }
  const sanitizedHost = element.host.replace(/(:80|:443)$/, '')
  return `${element.protocol}//${sanitizedHost}`
}
