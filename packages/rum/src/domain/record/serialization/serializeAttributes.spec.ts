import { registerCleanupTask } from '@datadog/browser-core/test'
import {
  CENSORED_IMG_MARK,
  CENSORED_STRING_MARK,
  NodePrivacyLevel,
  PRIVACY_ATTR_NAME,
  shouldMaskNode,
  STABLE_ATTRIBUTES,
} from '@datadog/browser-rum-core'
import { appendElement } from '@datadog/browser-rum-core/test'
import { createSerializationTransactionForTesting } from '../test/serialization.specHelper'
import type { ScrollPositions } from '../elementsScrollPositions'
import { getCssRulesString, serializeAttributes } from './serializeAttributes'
import { SerializationKind, type SerializationTransaction } from './serializationTransaction'
import type { VirtualAttributes } from './serialization.types'
import type { SerializationMetric, SerializationStats } from './serializationStats'
import { createSerializationStats } from './serializationStats'

const CSS_FILE_URL = '/base/packages/rum/test/toto.css'

const PRIVACY_LEVELS = Object.keys({
  [NodePrivacyLevel.ALLOW]: true,
  [NodePrivacyLevel.HIDDEN]: true,
  [NodePrivacyLevel.IGNORE]: true,
  [NodePrivacyLevel.MASK]: true,
  [NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED]: true,
  [NodePrivacyLevel.MASK_USER_INPUT]: true,
} satisfies Record<NodePrivacyLevel, true>) as NodePrivacyLevel[]

describe('serializeAttributes for DOM attributes', () => {
  let transaction: SerializationTransaction

  beforeEach(() => {
    transaction = createSerializationTransactionForTesting()
  })

  function serializeDOMAttributes(
    element: Element,
    nodePrivacyLevel: NodePrivacyLevel,
    transaction: SerializationTransaction
  ): Record<string, string | number | boolean | undefined> {
    return serializeAttributes(element, nodePrivacyLevel, transaction)
  }

  it('serializes attribute values', () => {
    interface TestCase {
      html: string

      // The serialization behavior we expect. There are several options:
      // - 'always-unmasked': We expect the value to be unmasked regardless of privacy
      // level. For HIDDEN, we expect the value not to be serialized.
      // - 'maskable': We expect the value to be masked or unmasked, depending on the
      // privacy level. For HIDDEN, we expect the value not to be serialized.
      // - 'maskable-boolean': Like 'maskable', except that we expect the attribute to be
      // serialized into a boolean value, and to not to be serialized at all when the
      // value is masked. (This is appropriate for boolean attributes.)
      // - 'maskable-image': Like 'maskable', except that we expect the masked
      // representation to be a data URL image.
      // - 'maskable-option-selected': Like 'maskable-boolean', in that when unmasked the
      // representation is a boolean value. However, when the value is masked, instead of
      // not being serialized, its underlying string value is used. The effect is a weird
      // hybrid of 'always-unmasked' and 'maskable-boolean'.
      // TODO: Eliminate this weird behavior by fixing <option selected>.
      expectedBehavior:
        | 'always-unmasked'
        | 'maskable'
        | 'maskable-boolean'
        | 'maskable-image'
        | 'maskable-option-selected'

      // How to treat the IGNORE privacy level. The default is 'unmasked'.
      // TODO: Eliminate this inconsistency by always masking for IGNORE.
      ignoreBehavior?: 'masked' | 'unmasked'

      // How to treat the MASK_UNLESS_ALLOWLISTED privacy level. The default is 'default'.
      // TODO: Eliminate this inconsistency by fixing <input type="color">, which behaves
      // differently than any other kind of input.
      maskUnlessAllowlistedBehavior?: 'default' | 'unmasked'
    }

    const testCases: TestCase[] = [
      // Privacy attributes should always be unmasked.
      { html: `<div ${PRIVACY_ATTR_NAME}="value">`, expectedBehavior: 'always-unmasked' },

      // Stable attributes should always be unmasked.
      ...STABLE_ATTRIBUTES.map(
        (attribute: string): TestCase => ({
          html: `<div ${attribute}="value">`,
          expectedBehavior: 'always-unmasked',
        })
      ),

      // Most data attributes should be maskable.
      { html: '<div data-foo="value">', expectedBehavior: 'maskable' },
      { html: '<div data-any-attribute="value">', expectedBehavior: 'maskable' },

      // Data attributes with no values should always be unmasked.
      { html: '<div data-empty-attribute>', expectedBehavior: 'always-unmasked' },

      // Attributes which are likely to contain human-readable text should be maskable.
      { html: '<div title="value">', expectedBehavior: 'maskable' },
      {
        html: '<img alt="value">',
        // TODO: This is a bug! This should just be 'maskable'.
        expectedBehavior: 'maskable-image',
      },
      { html: '<div alt="value">', expectedBehavior: 'maskable' },
      { html: '<input type="text" placeholder="value">', expectedBehavior: 'maskable' },
      { html: '<div placeholder="value">', expectedBehavior: 'maskable' },
      { html: '<div aria-label="value">', expectedBehavior: 'maskable' },
      { html: '<input name="value">', expectedBehavior: 'maskable' },
      { html: '<div name="value">', expectedBehavior: 'maskable' },

      // Element/attribute combinations which may contain user-identifying ids and tokens
      // should be maskable. The same attributes should always be unmasked in other
      // contexts.
      { html: '<a href="value">', expectedBehavior: 'maskable' },
      { html: '<div href="value">', expectedBehavior: 'always-unmasked' },
      { html: '<iframe srcdoc="value">', expectedBehavior: 'maskable' },
      { html: '<div srcdoc="value">', expectedBehavior: 'always-unmasked' },
      { html: '<img src="value">', expectedBehavior: 'maskable-image' },
      { html: '<img srcset="value">', expectedBehavior: 'maskable-image' },
      { html: '<source src="value">', expectedBehavior: 'maskable-image' },
      { html: '<source srcset="value">', expectedBehavior: 'maskable-image' },
      { html: '<div src="value">', expectedBehavior: 'always-unmasked' },
      { html: '<div srcset="value">', expectedBehavior: 'always-unmasked' },

      // The value attributes of button-like form elements should always be unmasked.
      { html: '<input type="button" value="value">', expectedBehavior: 'always-unmasked' },
      { html: '<input type="reset" value="value">', expectedBehavior: 'always-unmasked' },
      { html: '<input type="submit" value="value">', expectedBehavior: 'always-unmasked' },

      // The value attributes of other form elements should be maskable.
      { html: '<input type="checkbox" value="value">', expectedBehavior: 'maskable', ignoreBehavior: 'masked' },
      {
        html: '<input type="color" value="#e66465">',
        expectedBehavior: 'maskable',
        ignoreBehavior: 'masked',
        // TODO: This is almost certainly a bug; it's quite odd that only <input
        // type="color"> behaves this way. The intention was probably to make it behave
        // like the always-unmasked input elements, but the implementation was incomplete.
        maskUnlessAllowlistedBehavior: 'unmasked',
      },
      {
        html: '<input type="date" value="2018-06-12">',
        expectedBehavior: 'maskable',
        ignoreBehavior: 'masked',
      },
      {
        html: '<input type="datetime-local" value="2018-06-12T19:30">',
        expectedBehavior: 'maskable',
        ignoreBehavior: 'masked',
      },
      { html: '<input type="email" value="value">', expectedBehavior: 'maskable', ignoreBehavior: 'masked' },
      {
        html: '<input type="file" value="C:\\fakepath\\file.txt">',
        // TODO: This is a bug! It happens because HTMLInputElement#value is falsy until
        // the user has actually selected a file, causing us to ignore the result of
        // getElementInputValue() and fall back to the DOM attribute value.
        expectedBehavior: 'always-unmasked',
      },
      { html: '<input type="hidden" value="value">', expectedBehavior: 'maskable', ignoreBehavior: 'masked' },
      { html: '<input type="image" value="value">', expectedBehavior: 'maskable', ignoreBehavior: 'masked' },
      { html: '<input type="month" value="2018-05">', expectedBehavior: 'maskable', ignoreBehavior: 'masked' },
      { html: '<input type="number" value="42">', expectedBehavior: 'maskable', ignoreBehavior: 'masked' },
      { html: '<input type="password" value="value">', expectedBehavior: 'maskable', ignoreBehavior: 'masked' },
      { html: '<input type="radio" value="value">', expectedBehavior: 'maskable', ignoreBehavior: 'masked' },
      { html: '<input type="range" value="50">', expectedBehavior: 'maskable', ignoreBehavior: 'masked' },
      { html: '<input type="search" value="value">', expectedBehavior: 'maskable', ignoreBehavior: 'masked' },
      { html: '<input type="tel" value="value">', expectedBehavior: 'maskable', ignoreBehavior: 'masked' },
      { html: '<input type="text" value="value">', expectedBehavior: 'maskable', ignoreBehavior: 'masked' },
      { html: '<input type="time" value="13:30">', expectedBehavior: 'maskable', ignoreBehavior: 'masked' },
      { html: '<input type="url" value="value">', expectedBehavior: 'maskable', ignoreBehavior: 'masked' },
      { html: '<input type="week" value="2017-W01">', expectedBehavior: 'maskable', ignoreBehavior: 'masked' },

      // Boolean form element attributes should be maskable, but with special behavior:
      // when masked, the entire attribute should not be serialized.
      {
        html: '<option selected>',
        // TODO: This is a bug! If the <option> is masked, we don't set the value of
        // 'selected' based on the property, but we still allow the DOM attribute to be
        // recorded. We should fix this; this should be 'maskable-boolean'.
        expectedBehavior: 'maskable-option-selected',
        ignoreBehavior: 'masked',
      },
      {
        html: '<input type="checkbox" checked>',
        expectedBehavior: 'maskable-boolean',
        ignoreBehavior: 'masked',
      },
      {
        html: '<input type="radio" checked>',
        expectedBehavior: 'maskable-boolean',
        ignoreBehavior: 'masked',
      },
    ]

    for (const testCase of testCases) {
      const element = appendElement(testCase.html)
      const attribute = getTestAttribute(element)

      // Remove the element from the document so that 'maskable-image' elements all have a zero
      // size, giving all such attributes the same expected value.
      element.remove()

      for (const privacyLevel of PRIVACY_LEVELS) {
        const actual = serializeDOMAttributes(element, privacyLevel, transaction)[attribute.name]
        const expected = expectedValueForPrivacyLevel(testCase, element, attribute, privacyLevel)
        expect(actual).withContext(`${testCase.html} for ${privacyLevel}`).toEqual(expected)
      }
    }

    function getTestAttribute(element: HTMLElement): Attr {
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes.item(i)
        if (attr && attr.name !== 'type') {
          return attr
        }
      }

      throw new Error("Couldn't determine test attribute")
    }

    function expectedValueForPrivacyLevel(
      testCase: TestCase,
      element: Element,
      attribute: Attr,
      privacyLevel: NodePrivacyLevel
    ): boolean | string | undefined {
      let maskedValue: string | undefined = CENSORED_STRING_MARK
      if (testCase.expectedBehavior === 'maskable-boolean') {
        maskedValue = undefined
      } else if (testCase.expectedBehavior === 'maskable-image') {
        maskedValue = CENSORED_IMG_MARK
      } else if (testCase.expectedBehavior === 'maskable-option-selected') {
        maskedValue = attribute.value
      }

      let unmaskedValue: boolean | string = attribute.value
      if (['maskable-boolean', 'maskable-option-selected'].includes(testCase.expectedBehavior)) {
        unmaskedValue = attribute.value === ''
      }

      if (testCase.expectedBehavior === 'always-unmasked') {
        return privacyLevel === NodePrivacyLevel.HIDDEN ? undefined : unmaskedValue
      }

      switch (privacyLevel) {
        case NodePrivacyLevel.ALLOW:
          return unmaskedValue
        case NodePrivacyLevel.HIDDEN:
          return undefined
        case NodePrivacyLevel.IGNORE:
          return testCase.ignoreBehavior === 'masked' ? maskedValue : unmaskedValue
        case NodePrivacyLevel.MASK:
          return maskedValue
        case NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED:
          if (testCase.maskUnlessAllowlistedBehavior === 'unmasked') {
            return unmaskedValue
          }
          return maskedValue
        case NodePrivacyLevel.MASK_USER_INPUT:
          return ['checked', 'selected', 'value'].includes(attribute.name) &&
            shouldMaskNode(element, NodePrivacyLevel.MASK_USER_INPUT)
            ? maskedValue
            : unmaskedValue
        default:
          privacyLevel satisfies never
          return undefined
      }
    }
  })
})

fdescribe('serializeAttributes for virtual attributes', () => {
  let stats: SerializationStats
  let transaction: SerializationTransaction

  beforeEach(() => {
    stats = createSerializationStats()
    transaction = createSerializationTransactionForTesting({ stats })
  })

  function serializeVirtualAttributes(
    element: Element,
    nodePrivacyLevel: NodePrivacyLevel,
    transaction: SerializationTransaction
  ): VirtualAttributes {
    const attributes = serializeAttributes(element, nodePrivacyLevel, transaction)

    const virtualAttributes: VirtualAttributes = {}
    if ('_cssText' in attributes) {
      virtualAttributes._cssText = attributes._cssText as string
    }
    if ('rr_mediaState' in attributes) {
      virtualAttributes.rr_mediaState = attributes.rr_mediaState as 'paused' | 'played'
    }
    if ('rr_scrollLeft' in attributes) {
      virtualAttributes.rr_scrollLeft = attributes.rr_scrollLeft as number
    }
    if ('rr_scrollTop' in attributes) {
      virtualAttributes.rr_scrollTop = attributes.rr_scrollTop as number
    }
    if ('rr_width' in attributes) {
      virtualAttributes.rr_width = attributes.rr_width as string
    }
    if ('rr_height' in attributes) {
      virtualAttributes.rr_height = attributes.rr_height as string
    }

    return virtualAttributes
  }

  function expectVirtualAttributes(
    element: Element,
    expectedWhenNotHidden: VirtualAttributes,
    after?: (privacyLevel: NodePrivacyLevel) => void
  ): void {
    for (const privacyLevel of PRIVACY_LEVELS) {
      const actual = serializeVirtualAttributes(element, privacyLevel, transaction)
      const expected = privacyLevel === NodePrivacyLevel.HIDDEN ? {} : expectedWhenNotHidden
      expect(actual).withContext(`${element.tagName} ${privacyLevel}`).toEqual(expected)
      after?.(privacyLevel)
    }
  }

  describe('when serializing CSS text', () => {
    const cssText = 'div { background-color: green; top: 5px; }'
    const cssTextStats: SerializationMetric = { count: 1, max: 42, sum: 42 }
    const emptyStats: SerializationMetric = { count: 0, max: 0, sum: 0 }

    function checkStats(privacyLevel: NodePrivacyLevel): void {
      expect(stats.cssText).toEqual(privacyLevel === NodePrivacyLevel.HIDDEN ? emptyStats : cssTextStats)
      stats.cssText = { ...emptyStats }
    }

    it('handles link element stylesheets', async () => {
      const cssUrl = `data:text/css;base64,${btoa(cssText)}`

      const link = document.createElement('link')
      registerCleanupTask(() => {
        link.parentNode?.removeChild(link)
      })

      link.setAttribute('rel', 'stylesheet')
      link.setAttribute('href', cssUrl)

      const linkLoaded = new Promise((resolve) => link.addEventListener('load', resolve))
      document.body.appendChild(link)
      await linkLoaded

      // eslint-disable-next-line no-console
      console.log(`Link element href: "${link.href}"`)
      // eslint-disable-next-line no-console
      Array.from(document.styleSheets).forEach((sheet) => console.log(`Found stylesheet with href: "${sheet.href}"`))

      expectVirtualAttributes(link, { _cssText: cssText }, checkStats)
    })

    it('handles style element stylesheets', () => {
      const style = appendElement(`<style>${cssText}</style>`)
      expectVirtualAttributes(style, { _cssText: cssText }, checkStats)
    })
  })

  it('serializes media element playback state', () => {
    for (const tag of ['audio', 'video']) {
      const media = appendElement(`<${tag}>`)

      let isPaused: boolean
      Object.defineProperty(media, 'paused', { get: () => isPaused })

      isPaused = true
      expectVirtualAttributes(media, { rr_mediaState: 'paused' })

      isPaused = false
      expectVirtualAttributes(media, { rr_mediaState: 'played' })
    }
  })

  describe('when serializing scroll state', () => {
    it('reads from the DOM for the initial full snapshot', () => {
      transaction.kind = SerializationKind.INITIAL_FULL_SNAPSHOT

      const div = appendElement('<div>')

      const expected: ScrollPositions = {
        scrollLeft: 0,
        scrollTop: 0,
      }
      Object.defineProperty(div, 'scrollLeft', { get: () => expected.scrollLeft })
      Object.defineProperty(div, 'scrollTop', { get: () => expected.scrollTop })

      // For the initial full snapshot, we should read these values from the DOM. Store
      // unexpected values in ElementScrollPositions so that we can detect if they're
      // mistakenly used. Note that serializeVirtualAttributes() will write updated values
      // into ElementScrollPositions, so we need to reset it for each expectation.
      const poisonedScrollPositions = { scrollLeft: 9999, scrollTop: 9999 }
      transaction.scope.elementsScrollPositions.set(div, poisonedScrollPositions)

      const resetPoisonedScrollPositions = (privacyLevel: NodePrivacyLevel) => {
        const expectedStoredPositionsToChange =
          privacyLevel !== NodePrivacyLevel.HIDDEN && (expected.scrollLeft || expected.scrollTop)
        const expectedStoredPositions = expectedStoredPositionsToChange ? expected : poisonedScrollPositions
        expect(transaction.scope.elementsScrollPositions.get(div)).toEqual(expectedStoredPositions)
        transaction.scope.elementsScrollPositions.set(div, poisonedScrollPositions)
      }

      expected.scrollLeft = 1
      expected.scrollTop = 2
      expectVirtualAttributes(div, { rr_scrollLeft: 1, rr_scrollTop: 2 }, resetPoisonedScrollPositions)

      expected.scrollLeft = 0
      expected.scrollTop = 3
      expectVirtualAttributes(div, { rr_scrollTop: 3 }, resetPoisonedScrollPositions)

      expected.scrollLeft = 4
      expected.scrollTop = 0
      expectVirtualAttributes(div, { rr_scrollLeft: 4 }, resetPoisonedScrollPositions)

      expected.scrollLeft = 0
      expected.scrollTop = 0
      expectVirtualAttributes(div, {}, resetPoisonedScrollPositions)
    })

    it('reads from ElementsScrollPositions for subsequent full snapshots', () => {
      transaction.kind = SerializationKind.SUBSEQUENT_FULL_SNAPSHOT

      const div = appendElement('<div>')

      // For subsequent full snapshots, we should read these values from
      // ElementScrollPositions. Store unexpected values in the DOM so that we can detect
      // if they're mistakenly used.
      Object.defineProperty(div, 'scrollLeft', { value: 9999 })
      Object.defineProperty(div, 'scrollTop', { value: 9999 })

      const expected: ScrollPositions = {
        scrollLeft: 0,
        scrollTop: 0,
      }
      transaction.scope.elementsScrollPositions.set(div, expected)

      const checkElementScrollPositions = () => {
        expect(transaction.scope.elementsScrollPositions.get(div)).toEqual(expected)
      }

      expected.scrollLeft = 1
      expected.scrollTop = 2
      expectVirtualAttributes(div, { rr_scrollLeft: 1, rr_scrollTop: 2 }, checkElementScrollPositions)

      expected.scrollLeft = 0
      expected.scrollTop = 3
      expectVirtualAttributes(div, { rr_scrollTop: 3 }, checkElementScrollPositions)

      expected.scrollLeft = 4
      expected.scrollTop = 0
      expectVirtualAttributes(div, { rr_scrollLeft: 4 }, checkElementScrollPositions)

      expected.scrollLeft = 0
      expected.scrollTop = 0
      expectVirtualAttributes(div, {}, checkElementScrollPositions)
    })
  })
})

describe('getCssRulesString', () => {
  let styleNode: HTMLStyleElement

  beforeEach(() => {
    styleNode = document.createElement('style')
    document.body.appendChild(styleNode)

    registerCleanupTask(() => {
      document.body.removeChild(styleNode)
    })
  })

  it('returns the CSS rules as a string', () => {
    styleNode.sheet!.insertRule('body { color: red; }')

    expect(getCssRulesString(styleNode.sheet)).toBe('body { color: red; }')
  })

  it('properly escapes CSS rules selectors containing a colon', () => {
    styleNode.sheet!.insertRule('[foo\\:bar] { display: none; }')

    expect(getCssRulesString(styleNode.sheet)).toBe('[foo\\:bar] { display: none; }')
  })

  it('inlines imported external stylesheets', () => {
    styleNode.sheet!.insertRule(`@import url("${CSS_FILE_URL}");`)

    // Simulates an accessible external stylesheet
    spyOnProperty(styleNode.sheet!.cssRules[0] as CSSImportRule, 'styleSheet').and.returnValue({
      cssRules: [{ cssText: 'p { margin: 0; }' } as CSSRule] as unknown as CSSRuleList,
    } as CSSStyleSheet)

    expect(getCssRulesString(styleNode.sheet)).toBe('p { margin: 0; }')
  })

  it('does not skip the @import rules if the external stylesheet is inaccessible', () => {
    styleNode.sheet!.insertRule(`@import url("${CSS_FILE_URL}");`)

    // Simulates an inaccessible external stylesheet
    spyOnProperty(styleNode.sheet!.cssRules[0] as CSSImportRule, 'styleSheet').and.returnValue({
      get cssRules(): CSSRuleList {
        throw new Error('Cannot access rules')
      },
    } as CSSStyleSheet)

    expect(getCssRulesString(styleNode.sheet)).toBe(`@import url("${CSS_FILE_URL}");`)
  })
})
