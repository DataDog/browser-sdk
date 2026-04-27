import type { StyleSheet } from '../../../types'
import type { SerializationTransaction } from './serializationTransaction'

export function serializeStyleSheets(
  cssStyleSheets: CSSStyleSheet[] | undefined,
  transaction: SerializationTransaction
): StyleSheet[] | undefined {
  if (cssStyleSheets === undefined || cssStyleSheets.length === 0) {
    return undefined
  }
  const serializeStylesheet = (cssStyleSheet: CSSStyleSheet) => {
    const rules = cssStyleSheet.cssRules || cssStyleSheet.rules
    const cssRules = Array.from(rules, (cssRule) => cssRule.cssText)
    transaction.addMetric(
      'cssText',
      cssRules.reduce((totalLength, rule) => totalLength + rule.length, 0)
    )

    const styleSheet: StyleSheet = {
      cssRules,
      disabled: cssStyleSheet.disabled || undefined,
      media: cssStyleSheet.media.length > 0 ? Array.from(cssStyleSheet.media) : undefined,
    }
    return styleSheet
  }
  // Safari iOS 16.x implements adoptedStyleSheets as a FrozenArray that:
  // - can't be iterated over through map or for...of
  // - can't be converted to regular array with Array.from
  // - can't be detected with Array.isArray or Object.isFrozen
  // Use index access to avoid the issue
  const styleSheets: StyleSheet[] = []
  for (let index = 0; index < cssStyleSheets.length; index++) {
    styleSheets.push(serializeStylesheet(cssStyleSheets[index]))
  }
  return styleSheets
}
