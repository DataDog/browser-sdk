import { getLinkElementOrigin, getLocationOrigin } from './utils'

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
  if (checkURLSupported()) {
    return base !== undefined ? new URL(url, base) : new URL(url)
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

let isURLSupported: boolean | undefined
function checkURLSupported() {
  if (isURLSupported !== undefined) {
    return isURLSupported
  }
  try {
    const url = new URL('http://test/path')
    isURLSupported = url.href === 'http://test/path'
    return isURLSupported
  } catch {
    isURLSupported = false
  }
  return isURLSupported
}
