import { registerCleanupTask } from '@flashcatcloud/browser-core/test'
import { getCssRulesString } from './serializeAttributes'

const CSS_FILE_URL = '/base/packages/rum/test/toto.css'

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
