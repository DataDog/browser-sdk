import type { StyleSheet } from '../../../types'

export function serializeStyleSheets(cssStyleSheets: CSSStyleSheet[] | undefined): StyleSheet[] | undefined {
  if (cssStyleSheets === undefined || cssStyleSheets.length === 0) {
    return undefined
  }
  return cssStyleSheets.map((cssStyleSheet) => {
    const rules = cssStyleSheet.cssRules || cssStyleSheet.rules
    const cssRules = Array.from(rules, (cssRule) => cssRule.cssText)

    const styleSheet: StyleSheet = {
      cssRules,
      disabled: cssStyleSheet.disabled || undefined,
      media: cssStyleSheet.media.length > 0 ? Array.from(cssStyleSheet.media) : undefined,
    }
    return styleSheet
  })
}
