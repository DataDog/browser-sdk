import { isIE } from '@datadog/browser-core'
import { NodePrivacyLevel } from '../../constants'
import {
  getSerializedNodeId,
  hasSerializedNode,
  setSerializedNodeId,
  getElementInputValue,
  switchToAbsoluteUrl,
} from './serializationUtils'

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

describe('replace relative urls by absolute ones', () => {
  const cssHref = 'https://site.web/app-name/static/assets/resource.min.css'
  const resolvedPath = 'https://site.web/app-name/static/assets/fonts/fontawesome-webfont.eot'

  describe('replace relative url by absolute one', () => {
    it('should replace url when wrapped with signle quote', () => {
      const cssText = "{ font-family: FontAwesome; src: url('./fonts/fontawesome-webfont.eot'); }"
      expect(switchToAbsoluteUrl(cssText, cssHref)).toEqual(
        `{ font-family: FontAwesome; src: url('${resolvedPath}'); }`
      )
    })
    it('should replace url when wrapped with double quote', () => {
      const cssText = '{ font-family: FontAwesome; src: url("./fonts/fontawesome-webfont.eot"); }'
      expect(switchToAbsoluteUrl(cssText, cssHref)).toEqual(
        `{ font-family: FontAwesome; src: url("${resolvedPath}"); }`
      )
    })
    it('should replace url when not wrapped by a double quote', () => {
      const cssText = '{ font-family: FontAwesome; src: url(./fonts/fontawesome-webfont.eot); }'

      expect(switchToAbsoluteUrl(cssText, cssHref)).toEqual(`{ font-family: FontAwesome; src: url(${resolvedPath}); }`)
    })

    it('should replace url when not wrapped by a double quote', () => {
      const cssText = '{ font-family: FontAwesome; src: url(fonts/fontawesome-webfont.eot); }'

      expect(switchToAbsoluteUrl(cssText, cssHref)).toEqual(`{ font-family: FontAwesome; src: url(${resolvedPath}); }`)
    })
  })
  describe('do not replace url in css text', () => {
    it('should not replace url if baseUrl is null', () => {
      const cssText = '{ font-family: FontAwesome; src: url(./fonts/fontawesome-webfont.eot); }'

      expect(switchToAbsoluteUrl(cssText, null)).toEqual(cssText)
    })
    it('should not replace url if path is empty', () => {
      const cssText = '{ font-family: FontAwesome; src: url(); }'

      expect(switchToAbsoluteUrl(cssText, cssHref)).toEqual(cssText)
    })
    it('should not replace url if already absolute', () => {
      const cssText =
        '{ font-family: FontAwesome; src: url(https://site.web/app-name/static/assets/fonts/fontawesome-webfont.eot); }'

      expect(switchToAbsoluteUrl(cssText, cssHref)).toEqual(cssText)
    })
    it('should not replace url if data uri', () => {
      const cssText = '{ font-family: FontAwesome; src: url(data://static/assets/fonts/fontawesome-webfont.eot); }'

      expect(switchToAbsoluteUrl(cssText, cssHref)).toEqual(cssText)
    })
  })
})
