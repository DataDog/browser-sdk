import { isIE } from '@datadog/browser-core'
import { NodePrivacyLevel } from '../../constants'
import { getSerializedNodeId, hasSerializedNode, setSerializedNodeId, getElementInputValue } from './serializationUtils'

describe('serialized Node storage in DOM Nodes', () => {
  describe('hasSerializedNode', () => {
    it('returns false for DOM Nodes that are not yet serialized', () => {
      expect(hasSerializedNode(document.createElement('div'))).toBe(false)
    })

    it('returns true for DOM Nodes that have been serialized', () => {
      const node = document.createElement('div')
      setSerializedNodeId(node, 42)

      expect(hasSerializedNode(node)).toBe(true)
    })
  })

  describe('getSerializedNodeId', () => {
    it('returns undefined for DOM Nodes that are not yet serialized', () => {
      expect(getSerializedNodeId(document.createElement('div'))).toBe(undefined)
    })

    it('returns the serialized Node id', () => {
      const node = document.createElement('div')
      setSerializedNodeId(node, 42)

      expect(getSerializedNodeId(node)).toBe(42)
    })
  })
})

describe('getElementInputValue', () => {
  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
  })

  it('returns "undefined" for a non-input element', () => {
    expect(getElementInputValue(document.createElement('div'), NodePrivacyLevel.ALLOW)).toBeUndefined()
  })

  it('returns the value of a <input>', () => {
    const input = document.createElement('input')
    input.value = 'foo'
    expect(getElementInputValue(input, NodePrivacyLevel.ALLOW)).toBe('foo')
  })

  describe('when asked to return a masked value', () => {
    it('does not return the value of a <input type="password">', () => {
      const input = document.createElement('input')
      input.type = 'password'
      input.value = 'foo'
      // Serializing a `Hidden` element (which input[type=password] is by current spec) will only
      // return special allow listed attributes and `getElementInputValue` is never called.
      // But to be paranoid, we defensively check the case if it was called
      expect(getElementInputValue(input, NodePrivacyLevel.MASK)).toBe('***')
    })

    it('does not return the value of a <input> with a IGNORED privacy mode', () => {
      const input = document.createElement('input')
      input.value = 'foo'
      expect(getElementInputValue(input, NodePrivacyLevel.IGNORE)).toBe('***')
    })

    it('never returns the value of a <select>', () => {
      const select = document.createElement('select')
      const option = document.createElement('option')
      option.value = 'foo'
      select.appendChild(option)
      select.value = 'foo'
      expect(getElementInputValue(option, NodePrivacyLevel.MASK)).toBeUndefined()
    })

    it('always returns the value of a <input type="button">', () => {
      const input = document.createElement('input')
      input.value = 'foo'
      input.type = 'button'
      expect(getElementInputValue(input, NodePrivacyLevel.MASK)).toBe('foo')
    })

    it('always returns the value of a <input type="submit">', () => {
      const input = document.createElement('input')
      input.value = 'foo'
      input.type = 'submit'
      expect(getElementInputValue(input, NodePrivacyLevel.MASK)).toBe('foo')
    })

    it('always returns the value of a <input type="reset">', () => {
      const input = document.createElement('input')
      input.value = 'foo'
      input.type = 'reset'
      expect(getElementInputValue(input, NodePrivacyLevel.MASK)).toBe('foo')
    })
  })
})
