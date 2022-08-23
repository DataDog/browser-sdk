import { isIE } from '@datadog/browser-core'
import { getPathToNestedCSSRule } from './utils'

const firstStyleRule = '.selector-1 { color: #aaa }'
const secondStyleRule = '.selector-2 { color: #bbb }'
const firstsecondMediaRule = `
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

describe('getPathToNestedCSSRule', () => {
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
    styleSheet.insertRule(firstsecondMediaRule)
    styleSheet.insertRule(secondStyleRule)
    styleSheet.insertRule(firstStyleRule)
  })

  afterEach(() => {
    styleElement.remove()
  })

  it('should return undefined if the rule is not attached to a parent StyleSheet', () => {
    const grouppingRule = styleSheet.cssRules[3]
    expect(grouppingRule.parentStyleSheet).toBeDefined()
    // Removing rule from CSSStyleSheet
    styleSheet.deleteRule(3)

    expect(grouppingRule.parentStyleSheet).toEqual(null)
    expect(getPathToNestedCSSRule(grouppingRule)).toBeUndefined()
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
