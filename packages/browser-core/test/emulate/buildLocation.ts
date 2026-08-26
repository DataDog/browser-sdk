import { buildUrl } from '@datadog/js-core/util'
export function buildLocation(url: string, base = location.href) {
  const urlObject = buildUrl(url, base)
  return {
    hash: urlObject.hash,
    href: urlObject.href,
    pathname: urlObject.pathname,
    search: urlObject.search,
  } as Location
}
