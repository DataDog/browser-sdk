import { addExperimentalFeatures, ExperimentalFeature } from '@datadog/browser-core'
import { registerCleanupTask } from '../../../browser-core/test'
import { appendElement, mockRumConfiguration } from '../../test'
import { NodePrivacyLevel } from './privacyConstants'
import { getComposedPathSelector, CHARACTER_LIMIT } from './getComposedPathSelector'

const defaultConfiguration = mockRumConfiguration()

interface BrowserWindow extends Window {
  $DD_ALLOW?: Set<string>
}

/** Appends content inside a wrapper so the element is the only child (no nth-child from body). */
function appendElementInIsolation(html: string): HTMLElement {
  const wrapper = appendElement('<div></div>')
  return appendElement(html, wrapper)
}

/** Sets `$DD_ALLOW` and reliably restores it, even if the test fails before reaching the end. */
function defineAllowList(allowList: Set<string> | undefined) {
  ;(window as BrowserWindow).$DD_ALLOW = allowList
  registerCleanupTask(() => {
    ;(window as BrowserWindow).$DD_ALLOW = undefined
  })
}

describe('getSelectorFromComposedPath', () => {
  describe('getComposedPathSelector', () => {
    it('returns an empty string for an empty composedPath', () => {
      const result = getComposedPathSelector([], defaultConfiguration)
      expect(result).toEqual('')
    })

    it('filters out non-Element items from composedPath', () => {
      const element = appendElementInIsolation('<div id="test"></div>')
      const composedPath: EventTarget[] = [element, document.body, document, window]

      const result = getComposedPathSelector(composedPath, defaultConfiguration)

      expect(result).toBe('DIV#test;')
    })

    it('ignores BODY and HTML elements from the composedPath', () => {
      const composedPath: EventTarget[] = [document.body, document.documentElement]

      const result = getComposedPathSelector(composedPath, defaultConfiguration)

      expect(result).toBe('')
    })

    describe('element data extraction', () => {
      it('extracts tag name from element', () => {
        const element = appendElementInIsolation('<button></button>')
        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe('BUTTON;')
      })

      it('extracts id from element when present', () => {
        const element = appendElementInIsolation('<div id="my-id"></div>')
        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe('DIV#my-id;')
      })

      it('does not include id when not present', () => {
        const element = appendElementInIsolation('<div></div>')
        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe('DIV;')
      })

      it('extracts sorted classes from element', () => {
        const element = appendElementInIsolation('<div class="foo bar baz"></div>')
        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe('DIV.bar.baz.foo;')
      })

      it('excludes generated class names containing digits', () => {
        const element = appendElementInIsolation('<div class="foo1 bar"></div>')
        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe('DIV.bar;')
      })
    })

    describe('safe attribute filtering', () => {
      it('collects multiple safe attributes', () => {
        const element = appendElementInIsolation('<div data-testid="foo" data-qa="bar" data-cy="baz"></div>')
        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe('DIV[data-cy="baz"][data-qa="bar"][data-testid="foo"];')
      })

      it('does not collect non-allowlisted attributes', () => {
        const element = appendElementInIsolation('<div data-user-email="john@example.com" title="secret info"></div>')
        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe('DIV;')
      })

      it('collects data-dd-action-name attribute', () => {
        const element = appendElementInIsolation('<div data-dd-action-name="Submit Form"></div>')
        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe(`DIV[data-dd-action-name="${CSS.escape('Submit Form')}"];`)
      })

      it('collects role attribute', () => {
        const element = appendElementInIsolation('<div role="button"></div>')
        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe('DIV[role="button"];')
      })

      it('collects type attribute', () => {
        const element = appendElementInIsolation('<input type="submit" />')
        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe('INPUT[type="submit"];')
      })

      it('collects attribute containing separator characters ;', () => {
        const element = appendElementInIsolation('<div data-testid="foo;bar" />')
        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe('DIV[data-testid="foo\\;bar"];')
      })
    })

    describe('nthChild and nthOfType', () => {
      it('does not include nthChild when element is the only child', () => {
        const element = appendElement(`<div>
          <span target></span>
        </div>`)

        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe('SPAN;')
      })

      it('includes nthChild when element has siblings', () => {
        const element = appendElement(`<div>
          <span></span>
          <div></div>
          <span target></span>
        </div>`)

        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe('SPAN:nth-child(3):nth-of-type(2);')
      })

      it('calculates nthChild correctly for first child', () => {
        const element = appendElement(`<div>
          <span target></span>
          <div></div>
        </div>`)

        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe('SPAN:nth-child(1);')
      })

      it('does not include nthOfType when element is unique of its type', () => {
        const parent = appendElement('<div></div>')
        const span = appendElement('<span></span>', parent)
        appendElement('<div></div>', parent)

        const result = getComposedPathSelector([span], defaultConfiguration)

        // span is unique of type, but not unique child (has sibling)
        expect(result).toBe('SPAN:nth-child(1);')
      })

      it('includes nthOfType when the first element has same-type siblings', () => {
        const span1 = appendElement(`
          <div>
            <span target></span>
            <div></div>
            <span></span>
          </div>
        `)

        const result = getComposedPathSelector([span1], defaultConfiguration)

        expect(result).toBe('SPAN:nth-child(1):nth-of-type(1);')
      })

      it('calculates nthOfType correctly among mixed siblings', () => {
        const button = appendElement(`
          <div>
            <button></button>
            <div></div>
            <button target></button>
          </div>
        `)

        const result = getComposedPathSelector([button], defaultConfiguration)

        expect(result).toBe('BUTTON:nth-child(3):nth-of-type(2);')
      })

      it('handles elements in composedPath with their position data', () => {
        const grandparent = appendElementInIsolation('<div></div>')
        const parent = appendElement('<section target></section><article></article>', grandparent)
        const target = appendElement('<button></button>', parent)

        const composedPath = [target, parent, grandparent]
        const result = getComposedPathSelector(composedPath, defaultConfiguration)

        expect(result).toBe('BUTTON;SECTION:nth-child(1);DIV;')
      })

      it('does not include nthChild or nthOfType for elements without parent', () => {
        // Detached element with no parent
        const element = appendElementInIsolation('<div></div>')

        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe('DIV;')
      })
    })

    describe('truncation', () => {
      it('truncates the selector if it exceeds the character limit', () => {
        // generate an array of 1000 elements to test a long composedPath
        const composedPath = Array.from({ length: 1000 }, () =>
          appendElement('<div data-testid="test-btn" class="secret"></div>')
        )
        const result = getComposedPathSelector(composedPath, defaultConfiguration)

        expect(result.length).toBeLessThanOrEqual(CHARACTER_LIMIT)
      })
    })

    describe('edge cases', () => {
      it('handles elements with empty class attribute', () => {
        const element = appendElementInIsolation('<div class=""></div>')
        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe('DIV;')
      })

      it('handles elements with whitespace-only class', () => {
        const element = appendElement('<div><div target class="   "></div></div>')

        const result = getComposedPathSelector([element], defaultConfiguration)
        expect(result).toBe('DIV;')
      })

      it('handles SVG elements', () => {
        const element = appendElement('<div><svg target data-testid="my-svg" g="1"></svg></div>')

        const result = getComposedPathSelector([element], defaultConfiguration)

        // tagName for SVG in HTML document is lowercase
        expect(result).toBe('svg[data-testid="my-svg"];')
      })
    })

    describe('privacy-sensitive attributes (href, aria-label)', () => {
      it('does not collect href or aria-label when the experimental flag is disabled', () => {
        const element = appendElementInIsolation('<a href="/settings/profile" aria-label="Profile"></a>')

        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe('A;')
      })

      it('collects a relative href unchanged when the flag is enabled', () => {
        addExperimentalFeatures([ExperimentalFeature.COMPOSED_PATH_SELECTOR_ATTRIBUTES])
        const element = appendElementInIsolation('<a href="/settings/profile"></a>')

        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe(`A[href="${CSS.escape('/settings/profile')}"];`)
      })

      it('drops the query string values, the hash, and groups numeric path segments for an absolute href', () => {
        addExperimentalFeatures([ExperimentalFeature.COMPOSED_PATH_SELECTOR_ATTRIBUTES])
        const element = appendElementInIsolation(
          '<a href="https://app.example.com/orders/8842/edit?token=secret#section"></a>'
        )

        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe(`A[href="${CSS.escape('https://app.example.com/orders/?/edit?token')}"];`)
      })

      it('keeps query parameter names but drops their values and deduplicates repeated names', () => {
        addExperimentalFeatures([ExperimentalFeature.COMPOSED_PATH_SELECTOR_ATTRIBUTES])
        const element = appendElementInIsolation(
          '<a href="/search?query=secret+stuff&query=other&tile_def=%7B%22a%22%3A1%7D"></a>'
        )

        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe(`A[href="${CSS.escape('/search?query&tile_def')}"];`)
      })

      it('reduces a non-http(s) href to its scheme alone', () => {
        addExperimentalFeatures([ExperimentalFeature.COMPOSED_PATH_SELECTOR_ATTRIBUTES])
        const element = appendElementInIsolation('<a href="mailto:jane@example.com"></a>')

        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe(`A[href="${CSS.escape('mailto:')}"];`)
      })

      it('omits href entirely when it cannot be parsed as a URL', () => {
        addExperimentalFeatures([ExperimentalFeature.COMPOSED_PATH_SELECTOR_ATTRIBUTES])
        const element = appendElementInIsolation('<a href="http://"></a>')

        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe('A;')
      })

      it('resolves an empty href to the current document, instead of treating it as absent', () => {
        addExperimentalFeatures([ExperimentalFeature.COMPOSED_PATH_SELECTOR_ATTRIBUTES])
        const element = appendElementInIsolation('<a href=""></a>')

        const result = getComposedPathSelector([element], defaultConfiguration)

        // `getAttribute` returns `''` (present-but-empty), not `null`, so this must not be
        // confused with a missing href.
        expect(result).not.toBe('A;')
      })

      it('does not treat a percent-encoded non-ASCII path segment as generated', () => {
        addExperimentalFeatures([ExperimentalFeature.COMPOSED_PATH_SELECTOR_ATTRIBUTES])
        // "électronique" is percent-encoded by the URL parser to a byte sequence containing digits
        // (ex: %C3%A9), which must not make the segment look "generated" the way an id like "8842"
        // does — it should be kept (still percent-encoded, like the rest of the pathname), not
        // replaced by "?".
        const element = appendElementInIsolation('<a href="/produits/électronique"></a>')

        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe(`A[href="${CSS.escape('/produits/%C3%A9lectronique')}"];`)
      })

      it('never collects the raw href via the safe-attributes path, even if configured as the actionNameAttribute', () => {
        addExperimentalFeatures([ExperimentalFeature.COMPOSED_PATH_SELECTOR_ATTRIBUTES])
        const element = appendElementInIsolation('<a href="/reset-password?token=secret"></a>')

        const result = getComposedPathSelector([element], mockRumConfiguration({ actionNameAttribute: 'href' }))

        // Only the sanitized href (query values dropped) must appear, never the raw one — and only
        // once, not duplicated between the safe-attributes and privacy-sensitive-attributes paths.
        expect(result).toBe(`A[href="${CSS.escape('/reset-password?token')}"];`)
      })

      it('never duplicates aria-label via the safe-attributes path when configured as the actionNameAttribute', () => {
        addExperimentalFeatures([ExperimentalFeature.COMPOSED_PATH_SELECTOR_ATTRIBUTES])
        const element = appendElementInIsolation('<button aria-label="Secret label"></button>')

        const result = getComposedPathSelector(
          [element],
          mockRumConfiguration({ defaultPrivacyLevel: NodePrivacyLevel.MASK, actionNameAttribute: 'aria-label' })
        )

        // aria-label configured as the actionNameAttribute is exempt from masking, like any other
        // actionNameAttribute (ex: `data-dd-action-name`) — but it must appear only once, not
        // duplicated between the safe-attributes and privacy-sensitive-attributes paths.
        expect(result).toBe(`BUTTON[aria-label="${CSS.escape('Secret label')}"];`)
      })

      it('collects and normalizes aria-label', () => {
        addExperimentalFeatures([ExperimentalFeature.COMPOSED_PATH_SELECTOR_ATTRIBUTES])
        const element = appendElementInIsolation('<button aria-label="  Close   dialog  "></button>')

        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe(`BUTTON[aria-label="${CSS.escape('Close dialog')}"];`)
      })

      it('sorts href and aria-label together with the other safe attributes', () => {
        addExperimentalFeatures([ExperimentalFeature.COMPOSED_PATH_SELECTOR_ATTRIBUTES])
        const element = appendElementInIsolation('<a href="/foo" aria-label="Foo link" role="link"></a>')

        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe(`A[role="link"][aria-label="${CSS.escape('Foo link')}"][href="${CSS.escape('/foo')}"];`)
      })

      it('masks aria-label but never href at the mask privacy level', () => {
        addExperimentalFeatures([ExperimentalFeature.COMPOSED_PATH_SELECTOR_ATTRIBUTES])
        const element = appendElementInIsolation('<a href="/foo" aria-label="Secret label"></a>')

        const result = getComposedPathSelector(
          [element],
          mockRumConfiguration({ defaultPrivacyLevel: NodePrivacyLevel.MASK })
        )

        // href is never masked: its own sanitization (dropping query values, hash, and any
        // non-http(s) payload) is the only protection it gets, regardless of privacy level.
        expect(result).toBe(`A[aria-label="${CSS.escape('***')}"][href="${CSS.escape('/foo')}"];`)
      })

      it('never masks href, even at the mask-unless-allowlisted privacy level', () => {
        addExperimentalFeatures([ExperimentalFeature.COMPOSED_PATH_SELECTOR_ATTRIBUTES])
        const element = appendElementInIsolation('<a href="/foo" aria-label="Not allowed"></a>')

        const result = getComposedPathSelector(
          [element],
          mockRumConfiguration({ defaultPrivacyLevel: NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED })
        )

        expect(result).toBe(`A[aria-label="${CSS.escape('***')}"][href="${CSS.escape('/foo')}"];`)
      })

      it('does not mask href or aria-label at the default (mask-user-input) privacy level', () => {
        addExperimentalFeatures([ExperimentalFeature.COMPOSED_PATH_SELECTOR_ATTRIBUTES])
        const element = appendElementInIsolation('<a href="/foo" aria-label="Visible label"></a>')

        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe(`A[aria-label="${CSS.escape('Visible label')}"][href="${CSS.escape('/foo')}"];`)
      })

      it('does not mask href or aria-label when enablePrivacyForActionName is false', () => {
        addExperimentalFeatures([ExperimentalFeature.COMPOSED_PATH_SELECTOR_ATTRIBUTES])
        const element = appendElementInIsolation('<a href="/foo" aria-label="Secret label"></a>')

        const result = getComposedPathSelector(
          [element],
          mockRumConfiguration({ defaultPrivacyLevel: NodePrivacyLevel.MASK, enablePrivacyForActionName: false })
        )

        expect(result).toBe(`A[aria-label="${CSS.escape('Secret label')}"][href="${CSS.escape('/foo')}"];`)
      })

      it('preserves an allowlisted aria-label at the mask-unless-allowlisted privacy level', () => {
        addExperimentalFeatures([ExperimentalFeature.COMPOSED_PATH_SELECTOR_ATTRIBUTES])
        defineAllowList(new Set(['allowed label']))
        const element = appendElementInIsolation('<button aria-label="Allowed label"></button>')

        const result = getComposedPathSelector(
          [element],
          mockRumConfiguration({ defaultPrivacyLevel: NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED })
        )

        expect(result).toBe(`BUTTON[aria-label="${CSS.escape('Allowed label')}"];`)
      })

      it('masks a non-allowlisted aria-label at the mask-unless-allowlisted privacy level', () => {
        addExperimentalFeatures([ExperimentalFeature.COMPOSED_PATH_SELECTOR_ATTRIBUTES])
        defineAllowList(new Set())
        const element = appendElementInIsolation('<button aria-label="Not allowed"></button>')

        const result = getComposedPathSelector(
          [element],
          mockRumConfiguration({ defaultPrivacyLevel: NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED })
        )

        expect(result).toBe(`BUTTON[aria-label="${CSS.escape('***')}"];`)
      })

      it('masks aria-label unconditionally at the hidden privacy level, bypassing $DD_ALLOW', () => {
        addExperimentalFeatures([ExperimentalFeature.COMPOSED_PATH_SELECTOR_ATTRIBUTES])
        const element = appendElementInIsolation(
          '<button data-dd-privacy="hidden" aria-label="Card ending 4242, John Doe"></button>'
        )

        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe(`BUTTON[aria-label="${CSS.escape('***')}"];`)
      })

      it('does not leak the payload of a non-http(s) href with a leading control character', () => {
        addExperimentalFeatures([ExperimentalFeature.COMPOSED_PATH_SELECTOR_ATTRIBUTES])
        // A leading tab is invisible in markup but is trimmed by the URL parser before it detects
        // the scheme, unlike a naive regex anchored on the raw string.
        const element = appendElementInIsolation('<a href="\tmailto:jane@example.com?subject=secret"></a>')

        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe(`A[href="${CSS.escape('mailto:')}"];`)
      })

      it('reveals the true origin of a backslash-led href instead of hiding it as same-origin', () => {
        addExperimentalFeatures([ExperimentalFeature.COMPOSED_PATH_SELECTOR_ATTRIBUTES])
        // Browsers treat "\" like "/" for http(s) URLs, so this resolves cross-origin even though
        // it has no scheme and doesn't start with "//".
        const element = appendElementInIsolation('<a href="\\\\evil.example/account/12345"></a>')

        const result = getComposedPathSelector([element], defaultConfiguration)

        expect(result).toBe(`A[href="${CSS.escape('http://evil.example/account/?')}"];`)
      })
    })
  })
})
