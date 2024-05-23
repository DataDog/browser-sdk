import { isAdoptedStyleSheetsSupported } from '@datadog/browser-core/test'
import { serializeStyleSheets } from './serializeStyleSheets'

describe('serializeStyleSheets', () => {
  beforeEach(() => {
    if (!isAdoptedStyleSheetsSupported()) {
      pending('no adoptedStyleSheets support')
    }
  })
  it('should return undefined if no stylesheets', () => {
    expect(serializeStyleSheets(undefined)).toBe(undefined)
    expect(serializeStyleSheets([])).toBe(undefined)
  })

  it('should return serialized stylesheet', () => {
    const disabledStylesheet = new CSSStyleSheet({ disabled: true })
    disabledStylesheet.insertRule('div { width: 100%; }')
    const printStylesheet = new CSSStyleSheet({ disabled: false, media: 'print' })
    printStylesheet.insertRule('a { color: red; }')

    expect(serializeStyleSheets([disabledStylesheet, printStylesheet])).toEqual([
      { cssRules: ['div { width: 100%; }'], media: undefined, disabled: true },
      { cssRules: ['a { color: red; }'], media: ['print'], disabled: undefined },
    ])
  })
})
