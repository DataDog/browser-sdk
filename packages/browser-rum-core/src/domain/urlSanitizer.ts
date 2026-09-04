import { removeDuplicates } from '@datadog/browser-core'
import { normalizeUrl, buildUrl, globalObject } from '@datadog/js-core/util'
import { isGeneratedValue } from './getSelectorFromElement'

export const HREF_ATTRIBUTE = 'href'

/**
 * Arbitrary value, consistent with the truncation applied to action names, to avoid a single
 * free-form attribute (ex: a long aria-label) consuming the whole selector character budget.
 */
export const ATTRIBUTE_VALUE_LIMIT = 100

// Matches the scheme at the start of a URL, if any.
const URL_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/
// Matches an http(s) scheme exactly (case-insensitively).
const HTTP_SCHEME = /^https?:$/i

/**
 * Returns a PII-safe representation of an element's `href`, or `undefined` if the element has no
 * `href` or it cannot be parsed as a URL.
 *
 * The hash and any userinfo are always dropped. Non-http(s) schemes (`mailto:`, `tel:`,
 * `javascript:`, `data:`...) are reduced to the scheme alone, since their payload can contain
 * arbitrary PII (an email address, a phone number...). For http(s) URLs, path segments that look
 * generated (ex: containing a digit, following the same heuristic used for CSS ids and classes in
 * this file) are replaced by `?`, mirroring how the backend groups URL paths. Query string values
 * are dropped, but the (deduplicated) parameter names are kept, since they are typically static
 * field names rather than user data, and knowing which parameters were present is useful for
 * identifying the link without exposing what was in them. The origin is only included when the
 * attribute itself was written as an absolute (or protocol-relative) URL, to avoid implying a page
 * navigates cross-origin when it doesn't.
 */
export function getSanitizedHref(element: Element): string | undefined {
  // `getAttribute` returns `null` when the attribute is absent, but `''` when it's present-but-empty
  // (ex: `href=""`), which resolves to the current document per HTML semantics — so only `null`
  // should short-circuit here.
  const rawHref = element.getAttribute(HREF_ATTRIBUTE)
  if (rawHref === null) {
    return undefined
  }

  let url: URL
  try {
    url = buildUrl(normalizeUrl(rawHref))
  } catch {
    return undefined
  }

  // Checked on the *parsed* protocol, not the raw string: the URL parser trims leading/embedded
  // whitespace and control characters before detecting the scheme, so a regex anchored on the raw
  // string can miss a non-http(s) scheme (ex: a tab-prefixed "\tmailto:...") and let its whole
  // payload (an email address, a phone number, a script) through unfiltered below.
  if (!HTTP_SCHEME.test(url.protocol)) {
    return url.protocol.toLowerCase()
  }

  const groupedPath = groupUrlPath(url.pathname)
  const searchParamNames = getSearchParamNamesString(url.searchParams)
  const path = `${groupedPath}${searchParamNames}`

  // The raw attribute can look relative (no scheme, no leading "//") while still resolving to a
  // different origin than the current page: a backslash-led href (browsers treat "\" like "/" for
  // http(s) URLs) or one with leading whitespace/control characters (trimmed by the URL parser)
  // are both real examples. Comparing the resolved origin against the current one catches those
  // cases too, so we never imply a same-origin link when the href actually navigates elsewhere.
  const isAbsolute =
    URL_SCHEME.test(rawHref) || rawHref.startsWith('//') || url.origin !== globalObject.location?.origin
  return isAbsolute ? `${url.origin}${path}` : path
}

function groupUrlPath(pathname: string): string {
  return pathname
    .split('/')
    .map((segment) => (isGeneratedValue(decodeSegment(segment)) ? '?' : segment))
    .join('/')
}

// Percent-encoded non-ASCII characters (ex: "%C3%A9" for "é") contain digits that don't reflect the
// segment's actual content, which would make `isGeneratedValue` treat legitimate, non-English path
// segments as "generated". Decoding before the check avoids that false positive; if the segment
// isn't validly encoded, fall back to the raw segment rather than throwing.
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function getSearchParamNamesString(searchParams: URLSearchParams): string {
  const names = removeDuplicates(Array.from(searchParams.keys()))
  return names.length > 0 ? `?${names.join('&')}` : ''
}
