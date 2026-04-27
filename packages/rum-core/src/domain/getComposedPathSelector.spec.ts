import { appendElement } from '../../test'
import { getComposedPathSelector, CHARACTER_LIMIT } from './getComposedPathSelector'

/** Appends content inside a wrapper so the element is the only child (no nth-child from body). */
function appendElementInIsolation(html: string): HTMLElement {
  const wrapper = appendElement('<div></div>')
  return appendElement(html, wrapper)
}

describe('getSelectorFromComposedPath', () => {
  describe('getComposedPathSelector', () => {
    it('returns an empty string for an empty composedPath', () => {
      const result = getComposedPathSelector([], undefined)
      expect(result).toEqual('')
    })

    it('filters out non-Element items from composedPath', () => {
      const element = appendElementInIsolation('<div id="test"></div>')
      const composedPath: EventTarget[] = [element, document.body, document, window]

      const result = getComposedPathSelector(composedPath, undefined)

      expect(result).toBe('DIV#test;')
    })

    it('ignores BODY and HTML elements from the composedPath', () => {
      const composedPath: EventTarget[] = [document.body, document.documentElement]

      const result = getComposedPathSelector(composedPath, undefined)

      expect(result).toBe('')
    })

    describe('element data extraction', () => {
      it('extracts tag name from element', () => {
        const element = appendElementInIsolation('<button></button>')
        const result = getComposedPathSelector([element], undefined)

        expect(result).toBe('BUTTON;')
      })

      it('extracts id from element when present', () => {
        const element = appendElementInIsolation('<div id="my-id"></div>')
        const result = getComposedPathSelector([element], undefined)

        expect(result).toBe('DIV#my-id;')
      })

      it('does not include id when not present', () => {
        const element = appendElementInIsolation('<div></div>')
        const result = getComposedPathSelector([element], undefined)

        expect(result).toBe('DIV;')
      })

      it('extracts sorted classes from element', () => {
        const element = appendElementInIsolation('<div class="foo bar baz"></div>')
        const result = getComposedPathSelector([element], undefined)

        expect(result).toBe('DIV.bar.baz.foo;')
      })

      it('excludes generated class names containing digits', () => {
        const element = appendElementInIsolation('<div class="foo1 bar"></div>')
        const result = getComposedPathSelector([element], undefined)

        expect(result).toBe('DIV.bar;')
      })
    })

    describe('safe attribute filtering', () => {
      it('collects multiple safe attributes', () => {
        const element = appendElementInIsolation('<div data-testid="foo" data-qa="bar" data-cy="baz"></div>')
        const result = getComposedPathSelector([element], undefined)

        expect(result).toBe('DIV[data-cy="baz"][data-qa="bar"][data-testid="foo"];')
      })

      it('does not collect non-allowlisted attributes', () => {
        const element = appendElementInIsolation('<div data-user-email="john@example.com" title="secret info"></div>')
        const result = getComposedPathSelector([element], undefined)

        expect(result).toBe('DIV;')
      })

      it('collects data-dd-action-name attribute', () => {
        const element = appendElementInIsolation('<div data-dd-action-name="Submit Form"></div>')
        const result = getComposedPathSelector([element], undefined)

        expect(result).toBe(`DIV[data-dd-action-name="${CSS.escape('Submit Form')}"];`)
      })

      it('collects role attribute', () => {
        const element = appendElementInIsolation('<div role="button"></div>')
        const result = getComposedPathSelector([element], undefined)

        expect(result).toBe('DIV[role="button"];')
      })

      it('collects type attribute', () => {
        const element = appendElementInIsolation('<input type="submit" />')
        const result = getComposedPathSelector([element], undefined)

        expect(result).toBe('INPUT[type="submit"];')
      })

      it('collects attribute containing separator characters ;', () => {
        const element = appendElementInIsolation('<div data-testid="foo;bar" />')
        const result = getComposedPathSelector([element], undefined)

        expect(result).toBe('DIV[data-testid="foo\\;bar"];')
      })
    })

    describe('nthChild and nthOfType', () => {
      it('does not include nthChild when element is the only child', () => {
        const element = appendElement(`<div>
          <span target></span>
        </div>`)

        const result = getComposedPathSelector([element], undefined)

        expect(result).toBe('SPAN;')
      })

      it('includes nthChild when element has siblings', () => {
        const element = appendElement(`<div>
          <span></span>
          <div></div>
          <span target></span>
        </div>`)

        const result = getComposedPathSelector([element], undefined)

        expect(result).toBe('SPAN:nth-child(3):nth-of-type(2);')
      })

      it('calculates nthChild correctly for first child', () => {
        const element = appendElement(`<div>
          <span target></span>
          <div></div>
        </div>`)

        const result = getComposedPathSelector([element], undefined)

        expect(result).toBe('SPAN:nth-child(1);')
      })

      it('does not include nthOfType when element is unique of its type', () => {
        const parent = appendElement('<div></div>')
        const span = appendElement('<span></span>', parent)
        appendElement('<div></div>', parent)

        const result = getComposedPathSelector([span], undefined)

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

        const result = getComposedPathSelector([span1], undefined)

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

        const result = getComposedPathSelector([button], undefined)

        expect(result).toBe('BUTTON:nth-child(3):nth-of-type(2);')
      })

      it('handles elements in composedPath with their position data', () => {
        const grandparent = appendElementInIsolation('<div></div>')
        const parent = appendElement('<section target></section><article></article>', grandparent)
        const target = appendElement('<button></button>', parent)

        const composedPath = [target, parent, grandparent]
        const result = getComposedPathSelector(composedPath, undefined)

        expect(result).toBe('BUTTON;SECTION:nth-child(1);DIV;')
      })

      it('does not include nthChild or nthOfType for elements without parent', () => {
        // Detached element with no parent
        const element = appendElementInIsolation('<div></div>')

        const result = getComposedPathSelector([element], undefined)

        expect(result).toBe('DIV;')
      })
    })

    describe('truncation', () => {
      it('truncates the selector if it exceeds the character limit', () => {
        // generate an array of 1000 elements to test a long composedPath
        const composedPath = Array.from({ length: 1000 }, () =>
          appendElement('<div data-testid="test-btn" class="secret"></div>')
        )
        const result = getComposedPathSelector(composedPath, undefined)

        expect(result.length).toBeLessThanOrEqual(CHARACTER_LIMIT)
      })
    })

    describe('edge cases', () => {
      it('handles elements with empty class attribute', () => {
        const element = appendElementInIsolation('<div class=""></div>')
        const result = getComposedPathSelector([element], undefined)

        expect(result).toBe('DIV;')
      })

      it('handles elements with whitespace-only class', () => {
        const element = appendElement('<div><div target class="   "></div></div>')

        const result = getComposedPathSelector([element], undefined)
        expect(result).toBe('DIV;')
      })

      it('handles SVG elements', () => {
        const element = appendElement('<div><svg target data-testid="my-svg" g="1"></svg></div>')

        const result = getComposedPathSelector([element], undefined)

        // tagName for SVG in HTML document is lowercase
        expect(result).toBe('svg[data-testid="my-svg"];')
      })
    })
  })
})
