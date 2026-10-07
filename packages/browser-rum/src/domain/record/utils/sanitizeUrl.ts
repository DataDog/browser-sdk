import { buildUrl } from '@datadog/js-core/util'

/**
 * Remove the portions of the given URL which are most likely to contain tokens or other
 * sensitive data.
 */
export function sanitizeUrl(url: string): string {
  try {
    const parsedUrl = buildUrl(url)
    parsedUrl.search = '' // Drop all query parameters.
    parsedUrl.hash = '' // Drop the fragment identifier.
    return parsedUrl.href
  } catch {
    // The URL is unparseable; make a best-effort attempt to remove unwanted content.
    return url.split(/[?#]/)[0]
  }
}
