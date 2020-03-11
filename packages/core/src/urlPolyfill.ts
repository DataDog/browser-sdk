export function normalizeUrl(url: string) {
  return new URL(url, window.location.origin).href
}

export function isValidUrl(url: string) {
  try {
    return !!new URL(url)
  } catch {
    return false
  }
}

export function haveSameOrigin(url1: string, url2: string) {
  return getOrigin(url1) === getOrigin(url2)
}

export function getOrigin(url: string) {
  return new URL(url).origin
}

export function getPathName(url: string) {
  return new URL(url).pathname
}

export function getSearch(url: string) {
  return new URL(url).search
}

export function getHash(url: string) {
  return new URL(url).hash
}
