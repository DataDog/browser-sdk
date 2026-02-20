import { registerCleanupTask } from '@datadog/browser-core/test'
import { appendElement } from '../../test'
import { getComposedPathSelector, CHARACTER_LIMIT } from './getComposedPathSelector'

/** Appends content inside a wrapper so the element is the only child (no nth-child from body). */
function appendElementInIsolation(html: string): HTMLElement {
  const wrapper = document.createElement('div')
  document.body.appendChild(wrapper)
  registerCleanupTask(() => wrapper.remove())
  return appendElement(html, wrapper)
}

describe('getSelectorFromComposedPath', () => {
  describe('getComposedPathSelector', () => {
    it('returns an empty string for an empty composedPath', () => {
      const result = getComposedPathSelector([], undefined, [])
      expect(result).toEqual('')
    })

    it('filters out non-Element items from composedPath', () => {
      const element = appendElementInIsolation('<div id="test"></div>')
      const composedPath: EventTarget[] = [element, document.body, document, window]

      const result = getComposedPathSelector(composedPath, undefined, [])

      expect(result).toBe('DIV#test;')
    })

    it('ignores BODY and HTML elements from the composedPath', () => {
      const composedPath: EventTarget[] = [document.body, document.documentElement]

      const result = getComposedPathSelector(composedPath, undefined, [])

      expect(result).toBe('')
    })

    describe('element data extraction', () => {
      it('extracts tag name from element', () => {
        const element = appendElementInIsolation('<button></button>')
        const result = getComposedPathSelector([element], undefined, [])

        expect(result).toBe('BUTTON;')
      })

      it('extracts id from element when present', () => {
        const element = appendElementInIsolation('<div id="my-id"></div>')
        const result = getComposedPathSelector([element], undefined, [])

        expect(result).toBe('DIV#my-id;')
      })

      it('does not include id when not present', () => {
        const element = appendElementInIsolation('<div></div>')
        const result = getComposedPathSelector([element], undefined, [])

        expect(result).toBe('DIV;')
      })

      it('extracts sorted classes from element', () => {
        const element = appendElementInIsolation('<div class="foo bar baz"></div>')
        const result = getComposedPathSelector([element], undefined, [])

        expect(result).toBe('DIV.bar.baz.foo;')
      })

      it('excludes generated class names containing digits', () => {
        const element = appendElementInIsolation('<div class="foo1 bar"></div>')
        const result = getComposedPathSelector([element], undefined, [])

        expect(result).toBe('DIV.bar;')
      })
    })

    describe('safe attribute filtering', () => {
      it('only collects allowlisted attributes', () => {
        const element = appendElementInIsolation('<div data-testid="test-btn" data-random="secret"></div>')
        const result = getComposedPathSelector([element], undefined, [])

        expect(result).toBe('DIV[data-testid="test-btn"];')
      })

      it('collects multiple safe attributes', () => {
        const element = appendElementInIsolation('<div data-testid="foo" data-qa="bar" data-cy="baz"></div>')
        const result = getComposedPathSelector([element], undefined, [])

        expect(result).toBe('DIV[data-testid="foo"][data-qa="bar"][data-cy="baz"];')
      })

      it('does not collect non-allowlisted attributes', () => {
        const element = appendElementInIsolation('<div data-user-email="john@example.com" title="secret info"></div>')
        const result = getComposedPathSelector([element], undefined, [])

        expect(result).toBe('DIV;')
      })

      it('collects data-dd-action-name attribute', () => {
        const element = appendElementInIsolation('<div data-dd-action-name="Submit Form"></div>')
        const result = getComposedPathSelector([element], undefined, [])

        expect(result).toBe(`DIV[data-dd-action-name="${CSS.escape('Submit Form')}"];`)
      })

      it('collects role attribute', () => {
        const element = appendElementInIsolation('<div role="button"></div>')
        const result = getComposedPathSelector([element], undefined, [])

        expect(result).toBe('DIV[role="button"];')
      })

      it('collects type attribute', () => {
        const element = appendElementInIsolation('<input type="submit" />')
        const result = getComposedPathSelector([element], undefined, [])

        expect(result).toBe('INPUT[type="submit"];')
      })
    })

    describe('nthChild and nthOfType', () => {
      it('does not include nthChild when element is the only child', () => {
        const parent = document.createElement('div')
        const child = document.createElement('span')
        parent.appendChild(child)
        document.body.appendChild(parent)
        registerCleanupTask(() => parent.remove())

        const result = getComposedPathSelector([child], undefined, [])

        expect(result).toBe('SPAN;')
      })

      it('includes nthChild when element has siblings', () => {
        const parent = document.createElement('div')
        const child1 = document.createElement('span')
        const child2 = document.createElement('span')
        const child3 = document.createElement('span')
        parent.appendChild(child1)
        parent.appendChild(child2)
        parent.appendChild(child3)
        document.body.appendChild(parent)
        registerCleanupTask(() => parent.remove())

        const result = getComposedPathSelector([child2], undefined, [])

        expect(result).toBe('SPAN:nth-child(2):nth-of-type(2);')
      })

      it('calculates nthChild correctly for first child', () => {
        const parent = document.createElement('div')
        const child1 = document.createElement('span')
        const child2 = document.createElement('div')
        parent.appendChild(child1)
        parent.appendChild(child2)
        document.body.appendChild(parent)
        registerCleanupTask(() => parent.remove())

        const result = getComposedPathSelector([child1], undefined, [])

        expect(result).toBe('SPAN:nth-child(1);')
      })

      it('does not include nthOfType when element is unique of its type', () => {
        const parent = document.createElement('div')
        const span = document.createElement('span')
        const div = document.createElement('div')
        parent.appendChild(span)
        parent.appendChild(div)
        document.body.appendChild(parent)
        registerCleanupTask(() => parent.remove())

        const result = getComposedPathSelector([span], undefined, [])

        // span is unique of type, but not unique child (has sibling)
        expect(result).toBe('SPAN:nth-child(1);')
      })

      it('includes nthOfType when element has siblings of the same type', () => {
        const parent = document.createElement('div')
        const span1 = document.createElement('span')
        const span2 = document.createElement('span')
        const div = document.createElement('div')
        parent.appendChild(span1)
        parent.appendChild(div)
        parent.appendChild(span2)
        document.body.appendChild(parent)
        registerCleanupTask(() => parent.remove())

        const result = getComposedPathSelector([span2], undefined, [])

        expect(result).toBe('SPAN:nth-child(3):nth-of-type(2);')
      })

      it('includes nthOfType when the first element has same-type siblings', () => {
        const parent = document.createElement('div')
        const span1 = document.createElement('span')
        const div = document.createElement('div')
        const span2 = document.createElement('span')
        parent.appendChild(span1)
        parent.appendChild(div)
        parent.appendChild(span2)
        document.body.appendChild(parent)
        registerCleanupTask(() => parent.remove())

        const result = getComposedPathSelector([span1], undefined, [])

        expect(result).toBe('SPAN:nth-child(1):nth-of-type(1);')
      })

      it('calculates nthOfType correctly among mixed siblings', () => {
        const parent = document.createElement('div')
        const button1 = document.createElement('button')
        const span = document.createElement('span')
        const button2 = document.createElement('button')
        const div = document.createElement('div')
        const button3 = document.createElement('button')
        parent.appendChild(button1)
        parent.appendChild(span)
        parent.appendChild(button2)
        parent.appendChild(div)
        parent.appendChild(button3)
        document.body.appendChild(parent)
        registerCleanupTask(() => parent.remove())

        const result = getComposedPathSelector([button2], undefined, [])

        expect(result).toBe('BUTTON:nth-child(3):nth-of-type(2);')
      })

      it('handles elements in composedPath with their position data', () => {
        const wrapper = document.createElement('div')
        document.body.appendChild(wrapper)
        registerCleanupTask(() => wrapper.remove())

        const grandparent = document.createElement('div')
        const parent = document.createElement('section')
        const sibling = document.createElement('article')
        const target = document.createElement('button')

        grandparent.appendChild(parent)
        grandparent.appendChild(sibling)
        parent.appendChild(target)
        wrapper.appendChild(grandparent)

        const composedPath = [target, parent, grandparent]
        const result = getComposedPathSelector(composedPath, undefined, [])

        expect(result).toBe('BUTTON;SECTION:nth-child(1);DIV;')
      })

      it('does not include nthChild or nthOfType for elements without parent', () => {
        // Detached element with no parent
        const element = document.createElement('div')

        const result = getComposedPathSelector([element], undefined, [])

        expect(result).toBe('DIV;')
      })
    })

    describe('allowed html attributes', () => {
      it('includes allowed html attributes', () => {
        const element = appendElementInIsolation('<div data-test-allowed="test-btn" data-random="secret"></div>')
        const result = getComposedPathSelector([element], undefined, ['data-test-allowed'])

        expect(result).toBe('DIV[data-test-allowed="test-btn"];')
      })

      it('supports allowlists defined as regular expressions', () => {
        const element = appendElementInIsolation('<div data-test-custom="foo" data-random="secret"></div>')
        const result = getComposedPathSelector([element], undefined, [/^data-test-/])

        expect(result).toBe('DIV[data-test-custom="foo"];')
      })
    })

    describe('truncation', () => {
      it('truncates the selector if it exceeds the character limit', () => {
        const element = appendElementInIsolation(
          '<div data-test-allowed="test-btn" data-random="secret"></div>'.repeat(1000)
        )
        const result = getComposedPathSelector([element], undefined, ['data-test-allowed'])

        expect(result.length).toBeLessThanOrEqual(CHARACTER_LIMIT)
      })
    })

    describe('edge cases', () => {
      it('handles elements with empty class attribute', () => {
        const element = appendElementInIsolation('<div class=""></div>')
        const result = getComposedPathSelector([element], undefined, [])

        expect(result).toBe('DIV;')
      })

      it('handles elements with whitespace-only class', () => {
        const wrapper = document.createElement('div')
        document.body.appendChild(wrapper)
        registerCleanupTask(() => wrapper.remove())

        const element = document.createElement('div')
        element.setAttribute('class', '   ')
        wrapper.appendChild(element)

        const result = getComposedPathSelector([element], undefined, [])
        expect(result).toBe('DIV;')
      })

      it('handles SVG elements', () => {
        const wrapper = document.createElement('div')
        document.body.appendChild(wrapper)
        registerCleanupTask(() => wrapper.remove())

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('data-testid', 'my-svg')
        wrapper.appendChild(svg)

        const result = getComposedPathSelector([svg], undefined, [])

        // tagName for SVG in HTML document is lowercase
        expect(result).toBe('svg[data-testid="my-svg"];')
      })
    })
  })
})
