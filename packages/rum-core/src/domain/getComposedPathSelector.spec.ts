import { registerCleanupTask } from '@datadog/browser-core/test'
import { appendElement } from '../../test'
import {
  getComposedPathSelector,
} from './getComposedPathSelector'

describe('getSelectorFromComposedPath', () => {
  describe('getComposedPathSelector', () => {
    it('returns an empty string for an empty composedPath', () => {
      const result = getComposedPathSelector([], undefined, [])
      expect(result).toEqual('')
    })

    it('filters out non-Element items from composedPath', () => {
      const element = appendElement('<div id="test"></div>')
      const composedPath: EventTarget[] = [element, document, window]

      const result = getComposedPathSelector(composedPath, undefined, [])

      expect(result).toBe('div')
    })

    describe('element data extraction', () => {
      it('extracts tag name from element', () => {
        const element = appendElement('<button></button>')
        const result = getComposedPathSelector([element], undefined, [])

        expect(result).toBe('button')
      })

      it('extracts id from element when present', () => {
        const element = appendElement('<div id="my-id"></div>')
        const result = getComposedPathSelector([element], undefined, [])

        expect(result).toBe('div#my-id')
      })

      it('does not include id when not present', () => {
        const element = appendElement('<div></div>')
        const result = getComposedPathSelector([element], undefined, [])

        expect(result).toBe('div')
      })

      it('extracts classes from element', () => {
        const element = appendElement('<div class="foo bar baz"></div>')
        const result = getComposedPathSelector([element], undefined, [])

        expect(result).toBe('div.foo.bar.baz')
      })

      it('returns empty array for classes when none present', () => {
        const element = appendElement('<div></div>')
        const result = getComposedPathSelector([element], undefined, [])

        expect(result).toBe('div')
      })
    })

    describe('safe attribute filtering', () => {
      it('only collects allowlisted attributes', () => {
        const element = appendElement('<div data-testid="test-btn" data-random="secret"></div>')
        const result = getComposedPathSelector([element], undefined, [])

        expect(result).toBe('div[data-testid="test-btn"]')
      })

      it('collects multiple safe attributes', () => {
        const element = appendElement('<div data-testid="foo" data-qa="bar" data-cy="baz"></div>')
                const result = getComposedPathSelector([element], undefined, [])

        expect(result).toBe('div[data-testid="foo"][data-qa="bar"][data-cy="baz"]')
      })

      it('does not collect non-allowlisted attributes', () => {
        const element = appendElement('<div data-user-email="john@example.com" title="secret info"></div>')
        const result = getComposedPathSelector([element], undefined, [])

        expect(result).toBe('div')
      })

      it('collects data-dd-action-name attribute', () => {
        const element = appendElement('<div data-dd-action-name="Submit Form"></div>')
        const result = getComposedPathSelector([element], undefined, [])

        expect(result).toBe('div[data-dd-action-name="Submit Form"]')
      })

      it('collects role attribute', () => {
        const element = appendElement('<div role="button"></div>')
          const result = getComposedPathSelector([element], undefined, [])

        expect(result).toBe('div[role="button"]')
      })

      it('collects type attribute', () => {
        const element = appendElement('<input type="submit" />')
        const result = getComposedPathSelector([element], undefined, [])

        expect(result).toBe('input[type="submit"]')
      })
    })

    describe('duplicate removal', () => {
      it('removes duplicate classes that appear in parent elements', () => {
        const parent = document.createElement('div')
        parent.className = 'shared-class parent-only'
        const child = document.createElement('span')
        child.className = 'shared-class child-only'
        parent.appendChild(child)
        document.body.appendChild(parent)
        registerCleanupTask(() => parent.remove())

        // composedPath goes from target (child) to ancestors
        const composedPath = [child, parent]
          const result = getComposedPathSelector(composedPath, undefined, [])

        // Child should have both classes initially
        expect(result).toBe('span.child-only')
        // Parent keeps all its classes
        expect(result).toBe('div.shared-class.parent-only')
      })

      it('removes duplicate attribute values that appear in parent elements', () => {
        const parent = document.createElement('div')
        parent.setAttribute('data-testid', 'shared-testid')
        parent.setAttribute('data-qa', 'parent-qa')
        const child = document.createElement('span')
        child.setAttribute('data-testid', 'shared-testid')
        child.setAttribute('data-cy', 'child-cy')
        parent.appendChild(child)
        document.body.appendChild(parent)
        registerCleanupTask(() => parent.remove())

        const composedPath = [child, parent]
        const result = getComposedPathSelector(composedPath, undefined, [])

        // Child should not have the duplicated attribute value
        expect(result).toBe('span[data-cy="child-cy"]')
        // Parent keeps its attributes
        expect(result).toBe('div[data-testid="shared-testid"][data-qa="parent-qa"]')
      })

      it('handles multiple levels of nesting', () => {
        const grandparent = document.createElement('div')
        grandparent.className = 'level-gp shared'
        grandparent.setAttribute('data-testid', 'gp-id')

        const parent = document.createElement('div')
        parent.className = 'level-parent shared'
        parent.setAttribute('data-testid', 'parent-id')

        const child = document.createElement('span')
        child.className = 'level-child shared'
        child.setAttribute('data-testid', 'child-id')

        grandparent.appendChild(parent)
        parent.appendChild(child)
        document.body.appendChild(grandparent)
        registerCleanupTask(() => grandparent.remove())

        const composedPath = [child, parent, grandparent]
        const result = getComposedPathSelector(composedPath, undefined, [])

        // Child: only unique classes and attributes
        expect(result).toBe('span.level-child[data-testid="child-id"]')

        // Parent: unique + those from grandparent that are not in parent
        expect(result).toBe('div.level-parent[data-testid="parent-id"]')

        // Grandparent: keeps everything
        expect(result).toBe('div.level-gp.shared[data-testid="gp-id"]')
      })

      it('does not remove attributes with different values', () => {
        const parent = document.createElement('div')
        parent.setAttribute('data-testid', 'parent-value')
        const child = document.createElement('span')
        child.setAttribute('data-testid', 'child-value')
        parent.appendChild(child)
        document.body.appendChild(parent)
        registerCleanupTask(() => parent.remove())

        const composedPath = [child, parent]
        const result = getComposedPathSelector(composedPath, undefined, [])

        expect(result).toBe('span[data-testid="child-value"]')
        expect(result).toBe('div[data-testid="parent-value"]')
      })
    })

    describe('ShadowDOM support', () => {
      it('handles ShadowRoot in composedPath by skipping it', () => {
        const host = document.createElement('div')
        const shadowRoot = host.attachShadow({ mode: 'open' })
        const shadowButton = document.createElement('button')
        shadowButton.className = 'shadow-btn'
        shadowRoot.appendChild(shadowButton)
        document.body.appendChild(host)
        registerCleanupTask(() => host.remove())

        // Simulating a composedPath that includes ShadowRoot
        const composedPath = [shadowButton, shadowRoot as unknown as EventTarget, host]
          const result = getComposedPathSelector(composedPath, undefined, [])

        expect(result).toBe('button.shadow-btn')
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

        expect(result).toBe('span')
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

        expect(result).toBe('span:nth-child(2)')
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

        expect(result).toBe('span:nth-child(1)')
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
        expect(result).toBe('span:nth-child(1)')
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

        expect(result).toBe('span:nth-of-type(2)')
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

        expect(result).toBe('button:nth-child(3):nth-of-type(2)')
      })

      it('handles elements in composedPath with their position data', () => {
        const grandparent = document.createElement('div')
        const parent = document.createElement('section')
        const sibling = document.createElement('article')
        const target = document.createElement('button')

        grandparent.appendChild(parent)
        grandparent.appendChild(sibling)
        parent.appendChild(target)
        document.body.appendChild(grandparent)
        registerCleanupTask(() => grandparent.remove())

        const composedPath = [target, parent, grandparent]
        const result = getComposedPathSelector(composedPath, undefined, [])

        // target is only child
        expect(result).toBe('button')

        // parent has a sibling (sibling), but is unique of type
        expect(result).toBe('section:nth-child(1);article:nth-child(2);button')
      })

      it('does not include nthChild or nthOfType for elements without parent', () => {
        // Detached element with no parent
        const element = document.createElement('div')

        const result = getComposedPathSelector([element], undefined, [])

        expect(result).toBe('div')
      })
    })

    describe('allowed html attributes', () => {
      it('includes allowed html attributes', () => {
        const element = appendElement('<div data-test-allowed="test-btn" data-random="secret"></div>')
        const result = getComposedPathSelector([element], undefined, ['data-test-allowed'])

        expect(result).toBe('div[data-test-allowed="test-btn"]')
      })
    })

    describe('edge cases', () => {
      it('handles elements with empty class attribute', () => {
        const element = appendElement('<div class=""></div>')
        const result = getComposedPathSelector([element], undefined, [])

        expect(result).toBe('div')
      })

      it('handles elements with whitespace-only class', () => {
        const element = document.createElement('div')
        element.setAttribute('class', '   ')
        document.body.appendChild(element)
        registerCleanupTask(() => element.remove())

        const result = getComposedPathSelector([element], undefined, [])
        expect(result).toBe('div')
      })

      it('handles SVG elements', () => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('data-testid', 'my-svg')
        document.body.appendChild(svg)
        registerCleanupTask(() => svg.remove())

          const result = getComposedPathSelector([svg], undefined, [])

        expect(result).toBe('svg[data-testid="my-svg"]')
      })
    })
  })
})
