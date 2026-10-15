import { getElementStack, setElementStack } from './elementStack'

describe('elementStack', () => {
  it('uses the closest registered boundary and explicit property on the same element', () => {
    const outer = document.createElement('section')
    const inner = document.createElement('section')
    const button = document.createElement('button')
    outer.appendChild(inner)
    inner.appendChild(button)
    setElementStack(outer, 'outer')
    expect(getElementStack(button)).toBe('outer')
    setElementStack(inner, 'inner')
    expect(getElementStack(button)).toBe('inner')
    Object.assign(inner, { dd_element_stack: 'explicit' })
    expect(getElementStack(button)).toBe('explicit')
  })

  it('ignores invalid properties and crosses shadow roots', () => {
    const host = document.createElement('section')
    const button = document.createElement('button')
    host.attachShadow({ mode: 'open' }).appendChild(button)
    setElementStack(host, 'host')
    Object.assign(button, { dd_element_stack: 42 })
    expect(getElementStack(button)).toBe('host')
    Object.assign(button, { dd_element_stack: '  ' })
    expect(getElementStack(button)).toBe('host')
  })

  it('reads a multiline attribute from the closest ancestor', () => {
    const outer = document.createElement('section')
    const inner = document.createElement('section')
    const button = document.createElement('button')
    outer.appendChild(inner)
    inner.appendChild(button)
    setElementStack(outer, 'outer')
    const stack = 'Error\n    at checkout (https://example.com/checkout.js:1:2)'
    inner.setAttribute('data-dd-element-stack', stack)
    expect(getElementStack(button)).toBe(stack)
    inner.setAttribute('data-dd-element-stack', '  ')
    expect(getElementStack(button)).toBe('outer')
  })

  it('prefers the property over the attribute over the API on the same element', () => {
    const element = document.createElement('section')
    setElementStack(element, 'api')
    element.setAttribute('data-dd-element-stack', 'attribute')
    expect(getElementStack(element)).toBe('attribute')
    Object.assign(element, { dd_element_stack: 'property' })
    expect(getElementStack(element)).toBe('property')
  })

  it('does not write an attribute or a property for API registrations', () => {
    const element = document.createElement('section')
    const observer = new MutationObserver(() => undefined)
    observer.observe(element, { attributes: true })
    setElementStack(element, 'stack')
    expect(observer.takeRecords()).toEqual([])
    expect('dd_element_stack' in element).toBe(false)
    observer.disconnect()
  })
})
