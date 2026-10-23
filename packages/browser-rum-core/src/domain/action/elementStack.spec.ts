import { getElementStack } from './elementStack'

describe('element stack', () => {
  let elementStacks: WeakMap<Element, string>
  let parent: HTMLElement
  let target: HTMLElement

  beforeEach(() => {
    elementStacks = new WeakMap()
    parent = document.createElement('section')
    target = document.createElement('button')
    parent.appendChild(target)
  })

  it('returns undefined without a registered boundary', () => {
    expect(getElementStack(target, elementStacks)).toBeUndefined()
  })

  it('finds the nearest registered ancestor', () => {
    const outer = document.createElement('main')
    outer.appendChild(parent)
    elementStacks.set(outer, 'outer-stack')
    elementStacks.set(parent, 'parent-stack')
    expect(getElementStack(target, elementStacks)).toBe('parent-stack')
  })

  it('prefers a registered target even if its stack has no source metadata', () => {
    elementStacks.set(parent, 'parent-stack')
    elementStacks.set(target, 'unmatched-stack')
    expect(getElementStack(target, elementStacks)).toBe('unmatched-stack')
  })

  it('crosses nested shadow roots', () => {
    const host = document.createElement('div')
    const innerHost = document.createElement('div')
    host.attachShadow({ mode: 'open' }).appendChild(innerHost)
    innerHost.attachShadow({ mode: 'open' }).appendChild(parent)
    elementStacks.set(host, 'host-stack')
    expect(getElementStack(target, elementStacks)).toBe('host-stack')
  })

  it('keeps registrations isolated between registries', () => {
    elementStacks.set(target, 'registered-stack')
    expect(getElementStack(target, new WeakMap())).toBeUndefined()
  })

  it('looks up detached elements by identity', () => {
    elementStacks.set(target, 'target-stack')
    target.remove()
    expect(getElementStack(target, elementStacks)).toBe('target-stack')
    expect(getElementStack(target.cloneNode() as Element, elementStacks)).toBeUndefined()
  })
})
