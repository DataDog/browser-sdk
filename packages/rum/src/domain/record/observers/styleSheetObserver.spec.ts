import { isIE } from '@datadog/browser-core'
import { isFirefox } from '@datadog/browser-core/test'
import { serializeDocument, SerializationContextStatus } from '../serialization'
import { createElementsScrollPositions } from '../elementsScrollPositions'
import type { StyleSheetCallback } from './styleSheetObserver'
import { initStyleSheetObserver, getPathToNestedCSSRule } from './styleSheetObserver'
import { DEFAULT_CONFIGURATION, DEFAULT_SHADOW_ROOT_CONTROLLER } from './observers.specHelper'

describe('initStyleSheetObserver', () => {
  let stopStyleSheetObserver: () => void
  let styleSheetCallbackSpy: jasmine.Spy<StyleSheetCallback>
  let styleElement: HTMLStyleElement
  let styleSheet: CSSStyleSheet
  const styleRule = '.selector-1 { color: #fff }'

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
    styleSheetCallbackSpy = jasmine.createSpy()
    styleElement = document.createElement('style')
    document.head.appendChild(styleElement)
    styleSheet = styleElement.sheet!

    serializeDocument(document, DEFAULT_CONFIGURATION, {
      shadowRootsController: DEFAULT_SHADOW_ROOT_CONTROLLER,
      status: SerializationContextStatus.INITIAL_FULL_SNAPSHOT,
      elementsScrollPositions: createElementsScrollPositions(),
    })
  })

  afterEach(() => {
    stopStyleSheetObserver()
    styleElement.remove()
  })

  describe('observing high level css stylesheet', () => {
    describe('when inserting rules into stylesheet', () => {
      it('should capture CSSStyleRule insertion when no index is provided', () => {
        stopStyleSheetObserver = initStyleSheetObserver(styleSheetCallbackSpy)
        styleSheet.insertRule(styleRule)

        const styleSheetRule = styleSheetCallbackSpy.calls.first().args[0]
        expect(styleSheetRule.id).toBeDefined()
        expect(styleSheetRule.removes).toBeUndefined()
        expect(styleSheetRule.adds?.length).toEqual(1)
        expect(styleSheetRule.adds?.[0]?.index).toEqual(undefined)
      })

      it('should capture CSSStyleRule insertion when index is provided', () => {
        const index = 0

        stopStyleSheetObserver = initStyleSheetObserver(styleSheetCallbackSpy)
        styleSheet.insertRule(styleRule, index)

        const styleSheetRule = styleSheetCallbackSpy.calls.first().args[0]
        expect(styleSheetRule.id).toBeDefined()
        expect(styleSheetRule.removes).toBeUndefined()
        expect(styleSheetRule.adds?.length).toEqual(1)
        expect(styleSheetRule.adds?.[0]?.index).toEqual(index)
      })
    })

    describe('when removing rules from stylesheet', () => {
      it('should capture CSSStyleRule removal with the correct index', () => {
        styleSheet.insertRule(styleRule)
        const index = 0

        stopStyleSheetObserver = initStyleSheetObserver(styleSheetCallbackSpy)
        styleSheet.deleteRule(index)

        const styleSheetRule = styleSheetCallbackSpy.calls.first().args[0]
        expect(styleSheetRule.id).toBeDefined()
        expect(styleSheetRule.adds).toBeUndefined()
        expect(styleSheetRule.removes?.length).toEqual(1)
        expect(styleSheetRule.removes?.[0]).toEqual({ index })
      })
    })
  })

  describe('observing CSSGroupingRules inside a CSSStyleSheet', () => {
    describe('when inserting CSSRules inside a CSSGroupingRule', () => {
      it('should capture CSSRule with the correct path when no index is provided', () => {
        styleSheet.insertRule('@media cond-2 { @media cond-1 { .nest-1 { color: #ccc } } }')
        styleSheet.insertRule('.main {opacity: 0}')
        const groupingRule = (styleSheet.cssRules[1] as CSSGroupingRule).cssRules[0] as CSSGroupingRule

        stopStyleSheetObserver = initStyleSheetObserver(styleSheetCallbackSpy)
        groupingRule.insertRule(styleRule, 1)

        const styleSheetRule = styleSheetCallbackSpy.calls.first().args[0]
        expect(styleSheetRule.id).toBeDefined()
        expect(styleSheetRule.removes).toBeUndefined()
        expect(styleSheetRule.adds?.length).toEqual(1)
        expect(styleSheetRule.adds?.[0]?.index).toEqual([1, 0, 1])
      })

      it('should not create record when inserting into a detached CSSGroupingRule', () => {
        if (isFirefox()) {
          pending('Firefox does not support inserting rules in detached group')
        }

        styleSheet.insertRule('@media cond-2 { @media cond-1 { .nest-1 { color: #ccc } } }')

        const parentRule = styleSheet.cssRules[0] as CSSGroupingRule
        const groupingRule = parentRule.cssRules[0] as CSSGroupingRule
        parentRule.deleteRule(0)

        stopStyleSheetObserver = initStyleSheetObserver(styleSheetCallbackSpy)
        groupingRule.insertRule(styleRule, 0)

        expect(styleSheetCallbackSpy).not.toHaveBeenCalled()
      })
    })

    describe('when removing CSSRules from a CSSGroupingRule', () => {
      it('should capture CSSRule removal with the correct path', () => {
        styleSheet.insertRule('@media cond-2 { @media cond-1 { .nest-1 { color: #ccc } } }')
        styleSheet.insertRule('.main {opacity: 0}')
        const groupingRule = (styleSheet.cssRules[1] as CSSGroupingRule).cssRules[0] as CSSGroupingRule

        stopStyleSheetObserver = initStyleSheetObserver(styleSheetCallbackSpy)
        groupingRule.deleteRule(0)

        const styleSheetRule = styleSheetCallbackSpy.calls.first().args[0]
        expect(styleSheetRule.id).toBeDefined()
        expect(styleSheetRule.adds).toBeUndefined()
        expect(styleSheetRule.removes?.length).toEqual(1)
        expect(styleSheetRule.removes?.[0]?.index).toEqual([1, 0, 0])
      })

      it('should not create record when removing from a detached CSSGroupingRule', () => {
        if (isFirefox()) {
          pending('Firefox does not support inserting rules in detached group')
        }

        styleSheet.insertRule('@media cond-2 { @media cond-1 { .nest-1 { color: #ccc } } }')

        const parentRule = styleSheet.cssRules[0] as CSSGroupingRule
        const groupingRule = parentRule.cssRules[0] as CSSGroupingRule
        parentRule.deleteRule(0)

        stopStyleSheetObserver = initStyleSheetObserver(styleSheetCallbackSpy)
        groupingRule.deleteRule(0)

        expect(styleSheetCallbackSpy).not.toHaveBeenCalled()
      })
    })
  })
})

const firstStyleRule = '.selector-1 { color: #aaa }'
const secondStyleRule = '.selector-2 { color: #bbb }'
const firstMediaRule = `
    @media cond-1 {
        .selector-3-1 { color: #ccc }
        .selector-3-2 { color: #ddd }
        .selector-3-3 { color: #eee }
    }`
const secondMediaRule = `
    @media cond-2 {
        @media cond-2-1 {.selector-2-1-1 { display: none }}
        @media cond-2-2 {.selector-2-2-1 { display: clock }}
    }`

describe('StyleSheetObserver > getPathToNestedCSSRule', () => {
  let styleSheet: CSSStyleSheet
  let styleElement: HTMLStyleElement
  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
    styleElement = document.createElement('style')
    document.head.appendChild(styleElement)
    styleSheet = styleElement.sheet!

    styleSheet.insertRule(secondMediaRule)
    styleSheet.insertRule(firstMediaRule)
    styleSheet.insertRule(secondStyleRule)
    styleSheet.insertRule(firstStyleRule)
  })

  afterEach(() => {
    styleElement.remove()
  })

  it('should return undefined if the rule is not attached to a parent StyleSheet', () => {
    const groupingRule = styleSheet.cssRules[3]
    expect(groupingRule.parentStyleSheet).toBeDefined()
    // Removing rule from CSSStyleSheet
    styleSheet.deleteRule(3)

    expect(groupingRule.parentStyleSheet).toEqual(null)
    expect(getPathToNestedCSSRule(groupingRule)).toBeUndefined()
  })

  it('should return path to high level CSSStyleRule', () => {
    expect(getPathToNestedCSSRule(styleSheet.cssRules[1])).toEqual([1])
  })

  it('should return path to high level CSSGroupingRule', () => {
    expect(getPathToNestedCSSRule(styleSheet.cssRules[3])).toEqual([3])
  })

  it('should return path to nested CSSStyleRule', () => {
    const rule = (styleSheet.cssRules[2] as CSSGroupingRule).cssRules[1]
    expect(getPathToNestedCSSRule(rule)).toEqual([2, 1])
  })

  it('should return path to nested CSSGroupingRule', () => {
    const rule = (styleSheet.cssRules[3] as CSSGroupingRule).cssRules[0]
    expect(getPathToNestedCSSRule(rule)).toEqual([3, 0])
  })

  it('should return path to leaf CSSRule', () => {
    const rule = ((styleSheet.cssRules[3] as CSSGroupingRule).cssRules[1] as CSSGroupingRule).cssRules[0]
    expect(getPathToNestedCSSRule(rule)).toEqual([3, 1, 0])
  })
})
