import { buildUrl } from '../../src'

export function buildLocation(url: string, base = location.href) {
  const urlObject = buildUrl(url, base)
  return {
    hash: urlObject.hash,
    href: urlObject.href,
    pathname: urlObject.pathname,
    search: urlObject.search,
  } as Location
}
