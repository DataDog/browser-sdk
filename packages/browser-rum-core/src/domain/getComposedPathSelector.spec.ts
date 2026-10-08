import { addExperimentalFeatures, ExperimentalFeature } from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { appendElement, mockRumConfiguration } from '../../test'
import { getComposedPathSelector, CHARACTER_LIMIT, ATTRIBUTE_VALUE_LIMIT } from './getComposedPathSelector'
import type { BrowserWindow } from './privacy'
import { NodePrivacyLevel } from './privacyConstants'

const configuration = mockRumConfiguration()

/** Appends content inside a wrapper so the element is the only child (no nth-child from body). */
function appendElementInIsolation(html: string): HTMLElement {
  const wrapper = appendElement('<div></div>')
  return appendElement(html, wrapper)
}

describe('getSelectorFromComposedPath', () => {
  describe('getComposedPathSelector', () => {
    it('returns an empty string for an empty composedPath', () => {
      const result = getComposedPathSelector([], configuration)
      expect(result).toEqual('')
    })

    it('filters out non-Element items from composedPath', () => {
      const element = appendElementInIsolation('<div id="test"></div>')
      const composedPath: EventTarget[] = [element, document.body, document, window]

      const result = getComposedPathSelector(composedPath, configuration)

      expect(result).toBe('DIV#test;')
    })

    it('ignores BODY and HTML elements from the composedPath', () => {
      const composedPath: EventTarget[] = [document.body, document.documentElement]

      const result = getComposedPathSelector(composedPath, configuration)

      expect(result).toBe('')
    })

    describe('element data extraction', () => {
      it('extracts tag name from element', () => {
        const element = appendElementInIsolation('<button></button>')
        const result = getComposedPathSelector([element], configuration)

        expect(result).toBe('BUTTON;')
      })

      it('extracts id from element when present', () => {
        const element = appendElementInIsolation('<div id="my-id"></div>')
        const result = getComposedPathSelector([element], configuration)

        expect(result).toBe('DIV#my-id;')
      })

      it('does not include id when not present', () => {
        const element = appendElementInIsolation('<div></div>')
        const result = getComposedPathSelector([element], configuration)

        expect(result).toBe('DIV;')
      })

      it('extracts sorted classes from element', () => {
        const element = appendElementInIsolation('<div class="foo bar baz"></div>')
        const result = getComposedPathSelector([element], configuration)

        expect(result).toBe('DIV.bar.baz.foo;')
      })

      it('excludes generated class names containing digits', () => {
        const element = appendElementInIsolation('<div class="foo1 bar"></div>')
        const result = getComposedPathSelector([element], configuration)

        expect(result).toBe('DIV.bar;')
      })
    })

    describe('safe attribute filtering', () => {
      it('collects multiple safe attributes', () => {
        const element = appendElementInIsolation('<div data-testid="foo" data-qa="bar" data-cy="baz"></div>')
        const result = getComposedPathSelector([element], configuration)

        expect(result).toBe('DIV[data-cy="baz"][data-qa="bar"][data-testid="foo"];')
      })

      it('does not collect non-allowlisted attributes', () => {
        const element = appendElementInIsolation('<div data-user-email="john@example.com" title="secret info"></div>')
        const result = getComposedPathSelector([element], configuration)

        expect(result).toBe('DIV;')
      })

      it('collects data-dd-action-name attribute', () => {
        const element = appendElementInIsolation('<div data-dd-action-name="Submit Form"></div>')
        const result = getComposedPathSelector([element], configuration)

        expect(result).toBe(`DIV[data-dd-action-name="${CSS.escape('Submit Form')}"];`)
      })

      it('collects role attribute', () => {
        const element = appendElementInIsolation('<div role="button"></div>')
        const result = getComposedPathSelector([element], configuration)

        expect(result).toBe('DIV[role="button"];')
      })

      it('collects type attribute', () => {
        const element = appendElementInIsolation('<input type="submit" />')
        const result = getComposedPathSelector([element], configuration)

        expect(result).toBe('INPUT[type="submit"];')
      })

      it('collects attribute containing separator characters ;', () => {
        const element = appendElementInIsolation('<div data-testid="foo;bar" />')
        const result = getComposedPathSelector([element], configuration)

        expect(result).toBe('DIV[data-testid="foo\\;bar"];')
      })
    })

    describe('maskable attributes', () => {
      const maskConfiguration = mockRumConfiguration({ defaultPrivacyLevel: NodePrivacyLevel.MASK })

      it('does not collect maskable attributes when the experimental flag is disabled', () => {
        const element = appendElementInIsolation('<a href="/checkout" aria-label="Checkout" data-area="cart"></a>')

        expect(getComposedPathSelector([element], configuration)).toBe('A;')
      })

      it('does not collect the form action when the experimental flag is disabled', () => {
        const element = appendElementInIsolation('<form action="/users/42/edit" method="post"></form>')

        expect(getComposedPathSelector([element], configuration)).toBe('FORM[method="post"];')
      })

      describe('with the experimental flag enabled', () => {
        beforeEach(() => {
          addExperimentalFeatures([ExperimentalFeature.COMPOSED_PATH_SELECTOR_ATTRIBUTES])
        })

        it('collects href, aria-label, name, title, alt and data-* attributes', () => {
          const element = appendElementInIsolation(
            '<a href="/checkout" aria-label="Checkout" name="n" title="t" alt="a" data-area="cart"></a>'
          )

          expect(getComposedPathSelector([element], configuration)).toBe(
            'A[alt="a"][aria-label="Checkout"][data-area="cart"][href="\\/checkout"][name="n"][title="t"];'
          )
        })

        it('collects attributes from ancestors', () => {
          const main = appendElementInIsolation('<main id="shop" data-area="checkout"></main>')
          const link = appendElement('<a id="checkout-link" href="/checkout" aria-label="Checkout"></a>', main)
          const span = appendElement('<span class="icon" title="Continue">Continue</span>', link)

          expect(getComposedPathSelector([span, link, main], configuration)).toBe(
            'SPAN[title="Continue"].icon;A#checkout-link[aria-label="Checkout"][href="\\/checkout"];MAIN#shop[data-area="checkout"];'
          )
        })

        it('does not collect the form action', () => {
          const element = appendElementInIsolation('<form action="/users/42/edit" method="post"></form>')

          expect(getComposedPathSelector([element], configuration)).toBe('FORM[method="post"];')
        })

        it('does not collect href on non-anchor elements', () => {
          const element = appendElementInIsolation('<div href="/foo"></div>')

          expect(getComposedPathSelector([element], configuration)).toBe('DIV;')
        })

        it('does not collect the data-dd-privacy attribute', () => {
          const element = appendElementInIsolation('<div data-dd-privacy="allow"></div>')

          expect(getComposedPathSelector([element], configuration)).toBe('DIV;')
        })

        it('does not collect generated data-* attributes', () => {
          const element = appendElementInIsolation('<div data-v-7ba5bd90 data-area="cart"></div>')

          expect(getComposedPathSelector([element], configuration)).toBe('DIV[data-area="cart"];')
        })

        it('collects stable attributes like the other safe attributes', () => {
          const value = 'a'.repeat(ATTRIBUTE_VALUE_LIMIT + 50)
          const element = appendElementInIsolation(`<div data-dd-privacy="hidden" data-testid="${value}"></div>`)

          // Kept on hidden elements, not truncated
          expect(getComposedPathSelector([element], configuration)).toBe(`DIV[data-testid="${value}"];`)
        })

        it('escapes attribute names', () => {
          const element = appendElementInIsolation('<div data-a;b="x" data-on:click="y"></div>')

          expect(getComposedPathSelector([element], configuration)).toBe('DIV[data-a\\;b="x"][data-on\\:click="y"];')
        })

        it('masks values under the mask privacy level', () => {
          const element = appendElementInIsolation(
            '<a href="/orders/42" aria-label="Jane" name="n" title="t" alt="a" data-email="jane@example.com" data-testid="btn"></a>'
          )

          expect(getComposedPathSelector([element], maskConfiguration)).toBe(
            `A[alt="${CSS.escape('***')}"][aria-label="${CSS.escape('***')}"][data-email="${CSS.escape('***')}"][data-testid="btn"][href="${CSS.escape('***')}"][name="${CSS.escape('***')}"][title="${CSS.escape('***')}"];`
          )
        })

        it('masks values whatever the value of enablePrivacyForActionName', () => {
          const element = appendElementInIsolation('<div title="Jane"></div>')

          expect(
            getComposedPathSelector(
              [element],
              mockRumConfiguration({ defaultPrivacyLevel: NodePrivacyLevel.MASK, enablePrivacyForActionName: false })
            )
          ).toBe(`DIV[title="${CSS.escape('***')}"];`)
        })

        it('masks values when the element privacy level is mask', () => {
          const element = appendElementInIsolation('<div data-dd-privacy="mask" title="Jane"></div>')

          expect(getComposedPathSelector([element], configuration)).toBe(`DIV[title="${CSS.escape('***')}"];`)
        })

        it('masks allowlisted values under the mask privacy level', () => {
          ;(window as BrowserWindow).$DD_ALLOW = new Set(['checkout'])
          registerCleanupTask(() => {
            delete (window as BrowserWindow).$DD_ALLOW
          })
          const element = appendElementInIsolation('<div title="Checkout"></div>')

          expect(getComposedPathSelector([element], maskConfiguration)).toBe(`DIV[title="${CSS.escape('***')}"];`)
        })

        it('does not mask allowlisted values under the mask-unless-allowlisted privacy level', () => {
          ;(window as BrowserWindow).$DD_ALLOW = new Set(['checkout'])
          registerCleanupTask(() => {
            delete (window as BrowserWindow).$DD_ALLOW
          })
          const element = appendElementInIsolation('<div title="Checkout" aria-label="Jane"></div>')

          expect(
            getComposedPathSelector(
              [element],
              mockRumConfiguration({ defaultPrivacyLevel: NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED })
            )
          ).toBe(`DIV[aria-label="${CSS.escape('***')}"][title="Checkout"];`)
        })

        it('masks the action name attribute when it is a maskable attribute', () => {
          const element = appendElementInIsolation('<div title="Jane"></div>')

          expect(
            getComposedPathSelector(
              [element],
              mockRumConfiguration({ defaultPrivacyLevel: NodePrivacyLevel.MASK, actionNameAttribute: 'title' })
            )
          ).toBe(`DIV[title="${CSS.escape('***')}"];`)
        })

        it('masks the action name attribute when its name contains digits', () => {
          const element = appendElementInIsolation('<div data-ga4-label="Jane"></div>')

          expect(
            getComposedPathSelector(
              [element],
              mockRumConfiguration({
                defaultPrivacyLevel: NodePrivacyLevel.MASK,
                actionNameAttribute: 'data-ga4-label',
              })
            )
          ).toBe(`DIV[data-ga4-label="${CSS.escape('***')}"];`)
        })

        it('does not collect maskable attributes from hidden elements', () => {
          const element = appendElementInIsolation('<div data-dd-privacy="hidden" title="Jane" role="button"></div>')

          expect(getComposedPathSelector([element], configuration)).toBe('DIV[role="button"];')
        })

        it('truncates long values', () => {
          const element = appendElementInIsolation(`<div title="${'a'.repeat(ATTRIBUTE_VALUE_LIMIT + 50)}"></div>`)

          expect(getComposedPathSelector([element], configuration)).toBe(
            `DIV[title="${'a'.repeat(ATTRIBUTE_VALUE_LIMIT)}"];`
          )
        })
      })
    })

    describe('nthChild and nthOfType', () => {
      it('does not include nthChild when element is the only child', () => {
        const element = appendElement(`<div>
          <span target></span>
        </div>`)

        const result = getComposedPathSelector([element], configuration)

        expect(result).toBe('SPAN;')
      })

      it('includes nthChild when element has siblings', () => {
        const element = appendElement(`<div>
          <span></span>
          <div></div>
          <span target></span>
        </div>`)

        const result = getComposedPathSelector([element], configuration)

        expect(result).toBe('SPAN:nth-child(3):nth-of-type(2);')
      })

      it('calculates nthChild correctly for first child', () => {
        const element = appendElement(`<div>
          <span target></span>
          <div></div>
        </div>`)

        const result = getComposedPathSelector([element], configuration)

        expect(result).toBe('SPAN:nth-child(1);')
      })

      it('does not include nthOfType when element is unique of its type', () => {
        const parent = appendElement('<div></div>')
        const span = appendElement('<span></span>', parent)
        appendElement('<div></div>', parent)

        const result = getComposedPathSelector([span], configuration)

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

        const result = getComposedPathSelector([span1], configuration)

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

        const result = getComposedPathSelector([button], configuration)

        expect(result).toBe('BUTTON:nth-child(3):nth-of-type(2);')
      })

      it('handles elements in composedPath with their position data', () => {
        const grandparent = appendElementInIsolation('<div></div>')
        const parent = appendElement('<section target></section><article></article>', grandparent)
        const target = appendElement('<button></button>', parent)

        const composedPath = [target, parent, grandparent]
        const result = getComposedPathSelector(composedPath, configuration)

        expect(result).toBe('BUTTON;SECTION:nth-child(1);DIV;')
      })

      it('does not include nthChild or nthOfType for elements without parent', () => {
        // Detached element with no parent
        const element = appendElementInIsolation('<div></div>')

        const result = getComposedPathSelector([element], configuration)

        expect(result).toBe('DIV;')
      })
    })

    describe('truncation', () => {
      it('truncates the selector if it exceeds the character limit', () => {
        // generate an array of 1000 elements to test a long composedPath
        const composedPath = Array.from({ length: 1000 }, () =>
          appendElement('<div data-testid="test-btn" class="secret"></div>')
        )
        const result = getComposedPathSelector(composedPath, configuration)

        expect(result.length).toBeLessThanOrEqual(CHARACTER_LIMIT)
      })

      it('does not split an attribute when truncating', () => {
        const value = 'a'.repeat(100)
        const composedPath = Array.from({ length: 30 }, () =>
          appendElementInIsolation(`<div data-testid="${value}"></div>`)
        )
        const result = getComposedPathSelector(composedPath, configuration)

        // 17 elements use 2040 characters: only the 18th tag name fits
        expect(result).toBe(`${`DIV[data-testid="${value}"];`.repeat(17)}DIV`)
      })

      it('stops before a token that does not fit', () => {
        const element = appendElementInIsolation(
          `<div data-testid="${'a'.repeat(CHARACTER_LIMIT - 20)}" data-qa="${'b'.repeat(30)}"></div>`
        )

        // attributes are sorted: data-qa fits, data-testid does not
        expect(getComposedPathSelector([element], configuration)).toBe(`DIV[data-qa="${'b'.repeat(30)}"]`)
      })
    })

    describe('edge cases', () => {
      it('handles elements with empty class attribute', () => {
        const element = appendElementInIsolation('<div class=""></div>')
        const result = getComposedPathSelector([element], configuration)

        expect(result).toBe('DIV;')
      })

      it('handles elements with whitespace-only class', () => {
        const element = appendElement('<div><div target class="   "></div></div>')

        const result = getComposedPathSelector([element], configuration)
        expect(result).toBe('DIV;')
      })

      it('handles SVG elements', () => {
        const element = appendElement('<div><svg target data-testid="my-svg" g="1"></svg></div>')

        const result = getComposedPathSelector([element], configuration)

        // tagName for SVG in HTML document is lowercase
        expect(result).toBe('svg[data-testid="my-svg"];')
      })
    })
  })
})
