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

describe('switchToAbsoluteUrl', () => {
  const cssHref = 'https://site.web/app-name/static/assets/resource.min.css'
  const resolvedUrl = 'https://site.web/app-name/static/assets/fonts/fontawesome-webfont.eot'

  describe('convert relative url to absolute', () => {
    it('should replace url when wrapped in single quote', () => {
      const cssText = "{ font-family: FontAwesome; src: url('./fonts/fontawesome-webfont.eot'); }"
      expect(switchToAbsoluteUrl(cssText, cssHref)).toEqual(`{ font-family: FontAwesome; src: url('${resolvedUrl}'); }`)
    })
    it('should replace url when wrapped in double quote', () => {
      const cssText = '{ font-family: FontAwesome; src: url("./fonts/fontawesome-webfont.eot"); }'
      expect(switchToAbsoluteUrl(cssText, cssHref)).toEqual(`{ font-family: FontAwesome; src: url("${resolvedUrl}"); }`)
    })
    it('should replace url when not in any quote', () => {
      const cssText = '{ font-family: FontAwesome; src: url(./fonts/fontawesome-webfont.eot); }'

      expect(switchToAbsoluteUrl(cssText, cssHref)).toEqual(`{ font-family: FontAwesome; src: url(${resolvedUrl}); }`)
    })
    it('should replace url when url is relative', () => {
      const cssText = '{ font-family: FontAwesome; src: url(fonts/fontawesome-webfont.eot); }'

      expect(switchToAbsoluteUrl(cssText, cssHref)).toEqual(`{ font-family: FontAwesome; src: url(${resolvedUrl}); }`)
    })
    it('should replace url when url is at parent level', () => {
      const cssText = "{ font-family: FontAwesome; src: url('../fonts/fontawesome-webfont.eot'); }"

      expect(switchToAbsoluteUrl(cssText, cssHref)).toEqual(
        "{ font-family: FontAwesome; src: url('https://site.web/app-name/static/fonts/fontawesome-webfont.eot'); }"
      )
    })
    it('should replace multiple urls at the same time', () => {
      const cssText =
        '{ background-image: url(../images/pic.png); src: url("fonts/fantasticfont.woff"); content: url("./icons/icon.jpg");}'
      expect(switchToAbsoluteUrl(cssText, cssHref)).toEqual(
        '{ background-image: url(https://site.web/app-name/static/images/pic.png); src: url("https://site.web/app-name/static/assets/fonts/fantasticfont.woff"); content: url("https://site.web/app-name/static/assets/icons/icon.jpg");}'
      )
    })
  })

  describe('keep urls in css text unchanged', () => {
    it('should not replace url if baseUrl is null', () => {
      const cssText = '{ font-family: FontAwesome; src: url(./fonts/fontawesome-webfont.eot); }'

      expect(switchToAbsoluteUrl(cssText, null)).toEqual(cssText)
    })
    it('should not replace url if it is empty', () => {
      const cssText = '{ font-family: FontAwesome; src: url(); }'

      expect(switchToAbsoluteUrl(cssText, cssHref)).toEqual(cssText)
    })
    it('should not replace url if already absolute', () => {
      const cssText =
        '{ font-family: FontAwesome; src: url(https://site.web/app-name/static/assets/fonts/fontawesome-webfont.eot); }'

      expect(switchToAbsoluteUrl(cssText, cssHref)).toEqual(cssText)
    })
    it('should not replace url if it starts with //', () => {
      const cssText =
        '{ font-family: FontAwesome; src: url(//site.web/app-name/static/assets/fonts/fontawesome-webfont.eot); }'

      expect(switchToAbsoluteUrl(cssText, cssHref)).toEqual(cssText)
    })
    it('should not replace url if data uri: lower case', () => {
      const cssText =
        '{ font-family: FontAwesome; src: url(data:image/png;base64,iVBORNSUhEUgAAVR42mP8z/C/HgwJ/lK3Q6wAkJggg==); }'

      expect(switchToAbsoluteUrl(cssText, cssHref)).toEqual(cssText)
    })
    it('should not replace url if data uri: not lower case', () => {
      const cssText =
        '{ font-family: FontAwesome; src: url(DaTa:image/png;base64,iVBORNSUhEUgAAVR42mP8z/C/HgwJ/lK3Q6wAkJggg==); }'

      expect(switchToAbsoluteUrl(cssText, cssHref)).toEqual(cssText)
    })
    it('should not replace url if error is thrown when building absolute url', () => {
      const cssText =
        '{ font-family: FontAwesome; src: url(https://site.web/app-name/static/assets/fonts/fontawesome-webfont.eot); }'
      expect(switchToAbsoluteUrl(cssText, 'hello-world')).toEqual(cssText)
    })
  })
})
