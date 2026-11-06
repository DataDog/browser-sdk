import { appendElement } from '../../../test'
import { getElementStack } from './elementStack'

describe('element stack', () => {
  let elementStacks: WeakMap<Element, string>

  beforeEach(() => {
    elementStacks = new WeakMap()
  })

  it('returns undefined without a registered element', () => {
    const target = appendElement('<button></button>')

    expect(getElementStack([target], elementStacks)).toBeUndefined()
  })

  it('returns the registered target stack', () => {
    const target = appendElement('<section><button target></button></section>')
    elementStacks.set(target, 'target-stack')
    elementStacks.set(target.parentElement!, 'parent-stack')

    expect(getElementStack([target, target.parentElement!], elementStacks)).toBe('target-stack')
  })

  it('returns the nearest registered ancestor stack', () => {
    const target = appendElement('<main><section><button target></button></section></main>')
    const parent = target.parentElement!
    const outer = parent.parentElement!
    elementStacks.set(parent, 'parent-stack')
    elementStacks.set(outer, 'outer-stack')

    expect(getElementStack([target, parent, outer], elementStacks)).toBe('parent-stack')
  })

  it('skips non-Element items', () => {
    const host = appendElement('<div></div>')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    elementStacks.set(host, 'host-stack')

    expect(getElementStack([shadowRoot, host, document, window], elementStacks)).toBe('host-stack')
    expect(getElementStack([shadowRoot, document, window], elementStacks)).toBeUndefined()
  })
})
