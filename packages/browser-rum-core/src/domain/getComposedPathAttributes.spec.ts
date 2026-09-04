import { addExperimentalFeatures, ExperimentalFeature } from '@datadog/browser-core'
import { appendElement, mockRumConfiguration } from '../../test'
import { NodePrivacyLevel } from './privacyConstants'
import { getComposedPathAttributes } from './getComposedPathAttributes'
import type { NodePrivacyLevelCache } from './privacy'

const defaultConfiguration = mockRumConfiguration()

/** Appends content inside a wrapper so the element is the only child (no nth-child from body). */
function appendElementInIsolation(html: string): HTMLElement {
  const wrapper = appendElement('<div></div>')
  return appendElement(html, wrapper)
}

function collect(composedPath: EventTarget[], configuration = defaultConfiguration) {
  const cache: NodePrivacyLevelCache = new Map()
  return getComposedPathAttributes(composedPath, configuration, cache)
}

describe('getComposedPathAttributes', () => {
  it('returns undefined when the experimental flag is disabled', () => {
    const element = appendElementInIsolation('<a href="/foo" aria-label="Foo"></a>')

    expect(collect([element])).toBeUndefined()
  })

  describe('when the experimental flag is enabled', () => {
    beforeEach(() => {
      addExperimentalFeatures([ExperimentalFeature.COMPOSED_PATH_SELECTOR_ATTRIBUTES_MAP])
    })

    it('returns undefined for an empty composedPath', () => {
      expect(collect([])).toBeUndefined()
    })

    it('returns undefined when no relevant attribute is present', () => {
      const element = appendElementInIsolation('<div></div>')

      expect(collect([element])).toBeUndefined()
    })

    it('collects a sanitized href from an <a> element', () => {
      const element = appendElementInIsolation('<a href="/orders/8842/edit?token=secret#section"></a>')

      expect(collect([element])).toEqual({ href: '/orders/?/edit?token' })
    })

    it('collects href from an <area> element', () => {
      const element = appendElementInIsolation('<area href="/foo"></area>')

      expect(collect([element])).toEqual({ href: '/foo' })
    })

    it('does not collect href from a non-anchor element, even if present', () => {
      const element = appendElementInIsolation('<div href="/foo"></div>')

      expect(collect([element])).toBeUndefined()
    })

    it('collects a masked aria-label', () => {
      const element = appendElementInIsolation('<button aria-label="Close dialog"></button>')

      expect(collect([element])).toEqual({ 'aria-label': 'Close dialog' })
    })

    it('masks aria-label under the mask privacy level', () => {
      const element = appendElementInIsolation('<button aria-label="Secret label"></button>')

      const result = collect([element], mockRumConfiguration({ defaultPrivacyLevel: NodePrivacyLevel.MASK }))

      expect(result).toEqual({ 'aria-label': '***' })
    })

    it('collects name, title, and alt, masked the same way as aria-label', () => {
      const element = appendElementInIsolation('<img name="foo" title="bar" alt="baz" />')

      const result = collect([element], mockRumConfiguration({ defaultPrivacyLevel: NodePrivacyLevel.MASK }))

      expect(result).toEqual({ name: '***', title: '***', alt: '***' })
    })

    it('does not collect placeholder', () => {
      const element = appendElementInIsolation('<input placeholder="Enter your name" />')

      expect(collect([element])).toBeUndefined()
    })

    it('collects a stable data-* attribute unmasked, even under the mask privacy level', () => {
      const element = appendElementInIsolation('<div data-testid="submit-button"></div>')

      const result = collect([element], mockRumConfiguration({ defaultPrivacyLevel: NodePrivacyLevel.MASK }))

      expect(result).toEqual({ 'data-testid': 'submit-button' })
    })

    it('masks a non-stable data-* attribute under the mask privacy level', () => {
      const element = appendElementInIsolation('<div data-user-email="john@example.com"></div>')

      const result = collect([element], mockRumConfiguration({ defaultPrivacyLevel: NodePrivacyLevel.MASK }))

      expect(result).toEqual({ 'data-user-email': '***' })
    })

    it('excludes the SDK privacy-override attribute (data-dd-privacy) from the wildcard data-* collection', () => {
      const element = appendElementInIsolation('<div data-dd-privacy="mask" data-testid="submit"></div>')

      expect(collect([element])).toEqual({ 'data-testid': 'submit' })
    })

    it('collects id and role unmasked regardless of privacy level', () => {
      const element = appendElementInIsolation('<div id="my-id" role="button"></div>')

      const result = collect([element], mockRumConfiguration({ defaultPrivacyLevel: NodePrivacyLevel.MASK }))

      expect(result).toEqual({ id: 'my-id', role: 'button' })
    })

    describe('content-based PII sanitization (emails, digits)', () => {
      it('drops a non-stable data-* attribute containing an email, even at the default (mask-user-input) privacy level', () => {
        const element = appendElementInIsolation('<div data-user-email="john@example.com"></div>')

        expect(collect([element])).toBeUndefined()
      })

      it('drops an aria-label containing an email, even at the default privacy level', () => {
        const element = appendElementInIsolation('<button aria-label="Contact jane@example.com"></button>')

        expect(collect([element])).toBeUndefined()
      })

      it('drops an aria-label containing a digit, even at the default privacy level', () => {
        const element = appendElementInIsolation('<button aria-label="Page 2 of 10"></button>')

        expect(collect([element])).toBeUndefined()
      })

      it('drops a non-stable data-* attribute containing a digit, even at the default privacy level', () => {
        const element = appendElementInIsolation('<div data-user-id="12345"></div>')

        expect(collect([element])).toBeUndefined()
      })

      it('drops an id containing a digit', () => {
        const element = appendElementInIsolation('<div id="user-12345"></div>')

        expect(collect([element])).toBeUndefined()
      })

      it('drops a stable data-* attribute containing a digit, even though it is exempt from masking', () => {
        const element = appendElementInIsolation('<div data-testid="submit-button-2"></div>')

        expect(collect([element])).toBeUndefined()
      })

      it('does not drop other keys collected on the same element when one value is unsafe', () => {
        const element = appendElementInIsolation('<div id="user-12345" role="button"></div>')

        expect(collect([element])).toEqual({ role: 'button' })
      })
    })

    it('skips every attribute of an element at the hidden privacy level', () => {
      const element = appendElementInIsolation(
        '<a href="/foo" id="my-id" role="button" data-dd-privacy="hidden" aria-label="Card ending 4242"></a>'
      )

      expect(collect([element])).toBeUndefined()
    })

    it('skips every attribute of an ignored element', () => {
      const element = appendElementInIsolation('<script data-testid="tracker" id="my-id"></script>')

      expect(collect([element])).toBeUndefined()
    })

    it('keeps the closest (target-first) value when the same key appears on target and ancestor', () => {
      const parent = appendElementInIsolation('<a href="/parent-link" data-testid="parent"></a>')
      const target = appendElement('<button data-testid="child"></button>', parent)

      const result = collect([target, parent])

      expect(result).toEqual({ 'data-testid': 'child', href: '/parent-link' })
    })

    it('merges distinct keys collected across the composedPath', () => {
      const parent = appendElementInIsolation('<a href="/parent-link"></a>')
      const target = appendElement('<button aria-label="Click me"></button>', parent)

      const result = collect([target, parent])

      expect(result).toEqual({ 'aria-label': 'Click me', href: '/parent-link' })
    })

    it('truncates a long value to the attribute value limit', () => {
      const longLabel = 'a'.repeat(200)
      const element = appendElementInIsolation(`<button aria-label="${longLabel}"></button>`)

      const result = collect([element])

      expect(result!['aria-label'].length).toBe(100)
    })

    it('caps the number of collected keys and keeps collecting nothing further past the cap', () => {
      const letters = 'abcdefghijklmnopqrstuvwxy'.split('')
      const dataAttributes = letters.map((letter) => `data-attr-${letter}="value-${letter}"`).join(' ')
      const element = appendElementInIsolation(`<div ${dataAttributes}></div>`)

      const result = collect([element])

      expect(Object.keys(result!).length).toBe(20)
    })

    it('ignores non-Element items and HTML/BODY tags in the composedPath', () => {
      const composedPath: EventTarget[] = [document.body, document.documentElement, document, window]

      expect(collect(composedPath)).toBeUndefined()
    })
  })
})
