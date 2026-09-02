import { appendElement } from '../../test'
import { getSanitizedHref } from './urlSanitizer'

/** Appends content inside a wrapper so the element is the only child (no nth-child from body). */
function appendElementInIsolation(html: string): HTMLElement {
  const wrapper = appendElement('<div></div>')
  return appendElement(html, wrapper)
}

describe('getSanitizedHref', () => {
  it('returns undefined when the element has no href attribute', () => {
    const element = appendElementInIsolation('<a></a>')

    expect(getSanitizedHref(element)).toBeUndefined()
  })

  it('groups a numeric path segment and drops the hash, for a relative href', () => {
    const element = appendElementInIsolation('<a href="/orders/8842/edit#section"></a>')

    expect(getSanitizedHref(element)).toBe('/orders/?/edit')
  })

  it('drops query param values but keeps deduplicated param names', () => {
    const element = appendElementInIsolation('<a href="/search?q=secret&q=other&sort=asc"></a>')

    expect(getSanitizedHref(element)).toBe('/search?q&sort')
  })

  it('reduces a non-http(s) scheme href to the scheme alone', () => {
    const element = appendElementInIsolation('<a href="mailto:jane@example.com"></a>')

    expect(getSanitizedHref(element)).toBe('mailto:')
  })

  it('omits the origin when the href is written as a relative path', () => {
    const element = appendElementInIsolation('<a href="/foo/1"></a>')

    expect(getSanitizedHref(element)).toBe('/foo/?')
  })

  it('includes the origin when the href is written as an absolute URL, even if same-origin', () => {
    const element = appendElementInIsolation(`<a href="${window.location.origin}/foo/1"></a>`)

    expect(getSanitizedHref(element)).toBe(`${window.location.origin}/foo/?`)
  })

  it('includes the origin for a protocol-relative href', () => {
    const element = appendElementInIsolation(`<a href="//${window.location.host}/foo/1"></a>`)

    expect(getSanitizedHref(element)).toBe(`${window.location.origin}/foo/?`)
  })

  it('does not group a percent-encoded non-ASCII path segment (decoded only for the digit check)', () => {
    const element = appendElementInIsolation('<a href="/caf%C3%A9/list"></a>')

    expect(getSanitizedHref(element)).toBe('/caf%C3%A9/list')
  })
})
