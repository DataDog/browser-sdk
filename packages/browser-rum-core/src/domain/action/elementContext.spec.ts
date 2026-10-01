import type { Context } from '@datadog/browser-core'
import { getElementContext, setElementContext } from './elementContext'

describe('element context', () => {
  let parent: HTMLElement
  let target: HTMLElement

  beforeEach(() => {
    parent = document.createElement('section')
    target = document.createElement('button')
    parent.appendChild(target)
  })

  it('reads programmatic metadata from ancestors', () => {
    Object.assign(parent, { dd_service: 'checkout', dd_version: '2.4.0', dd_context: { productArea: 'purchase' } })
    expect(getElementContext(target)).toEqual({
      service: 'checkout',
      version: '2.4.0',
      context: { productArea: 'purchase' },
    })
  })

  it('reads declarative metadata without treating service and version as custom context', () => {
    target.setAttribute(
      'data-dd-context',
      JSON.stringify({ service: 'checkout', version: '2.4.0', context: { cart: 1 }, ignored: true })
    )
    expect(getElementContext(target)).toEqual({ service: 'checkout', version: '2.4.0', context: { cart: 1 } })
  })

  it('merges context with properties and descendants taking precedence', () => {
    setElementContext(parent, { service: 'shell', version: '1', context: { parent: true, nested: { a: 1, b: 1 } } })
    target.setAttribute(
      'data-dd-context',
      JSON.stringify({ service: 'attribute', context: { attribute: true, nested: { b: 2, c: 2 } } })
    )
    setElementContext(target, { service: 'checkout', context: { nested: { c: 3 } } })
    expect(getElementContext(target)).toEqual({
      service: 'checkout',
      version: '1',
      context: { parent: true, attribute: true, nested: { a: 1, b: 2, c: 3 } },
    })
  })

  for (const attribute of [
    'invalid JSON',
    'null',
    '[]',
    '42',
    '"string"',
    '{"service":42,"version":{},"context":[]}',
  ]) {
    it(`ignores invalid attribute metadata: ${attribute}`, () => {
      setElementContext(parent, { service: 'checkout', version: '1', context: { valid: true } })
      target.setAttribute('data-dd-context', attribute)
      expect(getElementContext(target)).toEqual({ service: 'checkout', version: '1', context: { valid: true } })
    })
  }

  it('ignores invalid properties and uses valid attribute metadata', () => {
    Object.assign(target, { dd_service: 42, dd_version: {}, dd_context: [] })
    target.setAttribute('data-dd-context', '{"service":"checkout","version":"1","context":{"valid":true}}')
    expect(getElementContext(target)).toEqual({ service: 'checkout', version: '1', context: { valid: true } })
  })

  it('crosses shadow roots', () => {
    const host = document.createElement('div')
    host.attachShadow({ mode: 'open' }).appendChild(parent)
    setElementContext(host, { service: 'checkout' })
    expect(getElementContext(target).service).toBe('checkout')
  })

  it('snapshots and sanitizes context without modifying customer data', () => {
    const context: { nested: { value: number }; self?: Context } = { nested: { value: 1 } }
    context.self = context
    setElementContext(target, { context })
    const result = getElementContext(target)
    context.nested.value = 2
    expect(result.context).toEqual({ nested: { value: 1 }, self: '[Reference seen at $]' })
    expect(context.self).toBe(context)
  })

  it('replaces programmatic metadata', () => {
    setElementContext(target, { service: 'checkout', version: '1', context: { cart: 1 } })
    setElementContext(target, { service: 'payment' })
    expect(getElementContext(target).service).toBe('payment')
    expect(getElementContext(target).version).toBeUndefined()
    expect(getElementContext(target).context).toBeUndefined()
  })
})
