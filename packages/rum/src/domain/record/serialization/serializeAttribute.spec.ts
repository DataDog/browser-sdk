import { isIE } from '@datadog/browser-core'

import type { RumConfiguration } from '@datadog/browser-rum-core'
import { STABLE_ATTRIBUTES, DEFAULT_PROGRAMMATIC_ACTION_NAME_ATTRIBUTE } from '@datadog/browser-rum-core'
import { NodePrivacyLevel, PRIVACY_ATTR_NAME } from '../../../constants'
import { MAX_ATTRIBUTE_VALUE_CHAR_LENGTH } from '../privacy'
import { serializeAttribute } from './serializeAttribute'

const DEFAULT_CONFIGURATION = {} as RumConfiguration

describe('serializeAttribute', () => {
  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
  })

  it('truncates "data:" URIs after long string length', () => {
    const node = document.createElement('p')

    const longString = new Array(MAX_ATTRIBUTE_VALUE_CHAR_LENGTH - 5).join('a')
    const maxAttributeValue = `data:,${longString}`
    const exceededAttributeValue = `data:,${longString}aa`
    const dataUrlAttributeValue = `data:,${longString}a`
    const truncatedValue = 'data:,'
    const ignoredAttributeValue = `foos:,${longString}`

    node.setAttribute('test-okay', maxAttributeValue)
    node.setAttribute('test-truncate', exceededAttributeValue)
    node.setAttribute('test-truncate', dataUrlAttributeValue)
    node.setAttribute('test-ignored', ignoredAttributeValue)

    expect(serializeAttribute(node, NodePrivacyLevel.ALLOW, 'test-okay', DEFAULT_CONFIGURATION)).toBe(maxAttributeValue)
    expect(serializeAttribute(node, NodePrivacyLevel.MASK, 'test-okay', DEFAULT_CONFIGURATION)).toBe(maxAttributeValue)

    expect(serializeAttribute(node, NodePrivacyLevel.MASK, 'test-ignored', DEFAULT_CONFIGURATION)).toBe(
      ignoredAttributeValue
    )

    expect(serializeAttribute(node, NodePrivacyLevel.ALLOW, 'test-truncate', DEFAULT_CONFIGURATION)).toBe(
      truncatedValue
    )
    expect(serializeAttribute(node, NodePrivacyLevel.MASK, 'test-truncate', DEFAULT_CONFIGURATION)).toBe(truncatedValue)
    expect(serializeAttribute(node, NodePrivacyLevel.MASK, 'test-truncate', DEFAULT_CONFIGURATION)).toBe(truncatedValue)
  })

  it('does not mask the privacy attribute', () => {
    const node = document.createElement('div')
    node.setAttribute(PRIVACY_ATTR_NAME, NodePrivacyLevel.MASK)
    expect(serializeAttribute(node, NodePrivacyLevel.MASK, PRIVACY_ATTR_NAME, DEFAULT_CONFIGURATION)).toBe('mask')
  })

  it('masks data attributes', () => {
    const node = document.createElement('div')
    node.setAttribute('data-foo', 'bar')
    expect(serializeAttribute(node, NodePrivacyLevel.MASK, 'data-foo', DEFAULT_CONFIGURATION)).toBe('***')
  })

  describe('attributes used to generate CSS selectors', () => {
    it('does not mask the default programmatic action name attributes', () => {
      const node = document.createElement('div')
      node.setAttribute(DEFAULT_PROGRAMMATIC_ACTION_NAME_ATTRIBUTE, 'foo')
      expect(
        serializeAttribute(
          node,
          NodePrivacyLevel.MASK,
          DEFAULT_PROGRAMMATIC_ACTION_NAME_ATTRIBUTE,
          DEFAULT_CONFIGURATION
        )
      ).toBe('foo')
    })

    it('does not mask the user-supplied programmatic action name attributes when it is a data attribute', () => {
      const node = document.createElement('div')
      node.setAttribute('data-my-custom-action-name', 'foo')
      expect(
        serializeAttribute(node, NodePrivacyLevel.MASK, 'data-my-custom-action-name', {
          ...DEFAULT_CONFIGURATION,
          actionNameAttribute: 'data-my-custom-action-name',
        })
      ).toBe('foo')
    })

    it('does not mask the user-supplied programmatic action name attributes when it not a data attribute', () => {
      const node = document.createElement('div')
      node.setAttribute('my-custom-action-name', 'foo')
      expect(
        serializeAttribute(node, NodePrivacyLevel.MASK, 'my-custom-action-name', {
          ...DEFAULT_CONFIGURATION,
          actionNameAttribute: 'my-custom-action-name',
        })
      ).toBe('foo')
    })

    it('does not mask other attributes used to generate CSS selectors', () => {
      const node = document.createElement('div')
      node.setAttribute(STABLE_ATTRIBUTES[0], 'foo')
      expect(serializeAttribute(node, NodePrivacyLevel.MASK, STABLE_ATTRIBUTES[0], DEFAULT_CONFIGURATION)).toBe('foo')
    })
  })

  describe('image masking', () => {
    let imageStub: Partial<Element> & { width: number; height: number; naturalWidth: number; naturalHeight: number }

    beforeEach(() => {
      imageStub = {
        width: 0,
        height: 0,
        naturalWidth: 0,
        naturalHeight: 0,
        tagName: 'IMG',
        getAttribute() {
          return 'http://foo.bar/image.png'
        },
        getBoundingClientRect() {
          return { width: this.width, height: this.height } as DOMRect
        },
      }
    })

    it('should use an image with same natural dimension than the original one', () => {
      imageStub.naturalWidth = 2000
      imageStub.naturalHeight = 1000
      expect(serializeAttribute(imageStub as Element, NodePrivacyLevel.MASK, 'src', DEFAULT_CONFIGURATION)).toBe(
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2000' height='1000' style='background-color:silver'%3E%3C/svg%3E"
      )
    })

    it('should use an image with same rendering dimension than the original one', () => {
      imageStub.width = 200
      imageStub.height = 100
      expect(serializeAttribute(imageStub as Element, NodePrivacyLevel.MASK, 'src', DEFAULT_CONFIGURATION)).toBe(
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='100' style='background-color:silver'%3E%3C/svg%3E"
      )
    })

    it("should use the censored image when original image size can't be computed", () => {
      expect(serializeAttribute(imageStub as Element, NodePrivacyLevel.MASK, 'src', DEFAULT_CONFIGURATION)).toBe(
        'data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=='
      )
    })
  })
})
