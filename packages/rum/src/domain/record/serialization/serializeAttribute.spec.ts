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

    const longString = new Array(MAX_ATTRIBUTE_VALUE_CHAR_LENGTH + 1 - 5).join('a')
    const maxAttributeValue = `data:${longString}`
    const exceededAttributeValue = `data:${longString}1`
    const ignoredAttributeValue = `foos:${longString}`

    node.setAttribute('test-okay', maxAttributeValue)
    node.setAttribute('test-truncate', exceededAttributeValue)
    node.setAttribute('test-ignored', ignoredAttributeValue)

    expect(serializeAttribute(node, NodePrivacyLevel.ALLOW, 'test-okay', DEFAULT_CONFIGURATION)).toBe(maxAttributeValue)
    expect(serializeAttribute(node, NodePrivacyLevel.MASK, 'test-okay', DEFAULT_CONFIGURATION)).toBe(maxAttributeValue)

    expect(serializeAttribute(node, NodePrivacyLevel.MASK, 'test-ignored', DEFAULT_CONFIGURATION)).toBe(
      ignoredAttributeValue
    )

    expect(serializeAttribute(node, NodePrivacyLevel.ALLOW, 'test-truncate', DEFAULT_CONFIGURATION)).toBe(
      'data:truncated'
    )
    expect(serializeAttribute(node, NodePrivacyLevel.MASK, 'test-truncate', DEFAULT_CONFIGURATION)).toBe(
      'data:truncated'
    )
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
})
