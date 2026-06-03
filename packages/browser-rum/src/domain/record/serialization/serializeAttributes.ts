import { NodePrivacyLevel, shouldMaskNode } from '@datadog/browser-rum-core'
import { isSafari } from '@datadog/browser-core'
import { getElementInputValue, normalizedTagName, switchToAbsoluteUrl } from './serializationUtils'
import { serializeAttribute } from './serializeAttribute'
import type { SerializationTransaction } from './serializationTransaction'
import { SerializationKind } from './serializationTransaction'
import type { VirtualAttributes } from './serialization.types'

export function serializeAttributes(
  element: Element,
  nodePrivacyLevel: NodePrivacyLevel,
  transaction: SerializationTransaction
): Record<string, number | string> {
  return {
    ...serializeDOMAttributes(element, nodePrivacyLevel, transaction),
    ...serializeVirtualAttributes(element, nodePrivacyLevel, transaction),
  }
}

export function serializeDOMAttributes(
  element: Element,
  nodePrivacyLevel: NodePrivacyLevel,
  transaction: SerializationTransaction
): Record<string, string> {
  if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
    return {}
  }

  const attrs: Record<string, string> = {}
  const tagName = normalizedTagName(element)

  for (let i = 0; i < element.attributes.length; i += 1) {
    const attribute = element.attributes.item(i)!
    const attributeName = attribute.name
    const attributeValue = serializeAttribute(element, nodePrivacyLevel, attributeName, transaction.scope.configuration)
    if (attributeValue !== null) {
      attrs[attributeName] = attributeValue
    }
  }

  if (
    (element as HTMLInputElement).value &&
    (tagName === 'textarea' || tagName === 'select' || tagName === 'option' || tagName === 'input')
  ) {
    const formValue = getElementInputValue(element, nodePrivacyLevel)
    if (formValue !== undefined) {
      attrs.value = formValue
    }
  }

  /**
   * <Option> can be selected, which occurs if its `value` matches ancestor `<Select>.value`
   */
  if (tagName === 'option') {
    const optionElement = element as HTMLOptionElement
    if (optionElement.selected && !shouldMaskNode(optionElement, nodePrivacyLevel)) {
      attrs.selected = ''
    } else {
      delete attrs.selected
    }
  }

  /**
   * Forms: input[type=checkbox,radio]
   * The `checked` property for <input> is a little bit special:
   * 1. el.checked is a setter that returns if truthy.
   * 2. getAttribute returns the string value
   * getAttribute('checked') does not sync with `Element.checked`, so use JS property
   * NOTE: `checked` property exists on `HTMLInputElement`. For serializer assumptions, we check for type=radio|check.
   */
  const inputElement = element as HTMLInputElement
  if (tagName === 'input' && (inputElement.type === 'radio' || inputElement.type === 'checkbox')) {
    if (inputElement.checked && !shouldMaskNode(inputElement, nodePrivacyLevel)) {
      attrs.checked = ''
    } else {
      delete attrs.checked
    }
  }

  return attrs
}

export function serializeVirtualAttributes(
  element: Element,
  nodePrivacyLevel: NodePrivacyLevel,
  transaction: SerializationTransaction
): VirtualAttributes {
  if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
    return {}
  }

  const attrs: VirtualAttributes = {}
  const doc = element.ownerDocument
  const tagName = normalizedTagName(element)

  // remote css
  if (tagName === 'link') {
    const stylesheet = Array.from(doc.styleSheets).find((s) => s.href === (element as HTMLLinkElement).href)
    const cssText = getCssRulesString(stylesheet)
    if (cssText && stylesheet) {
      transaction.addMetric('cssText', cssText.length)
      attrs._cssText = cssText
    }
  }

  // dynamic stylesheet
  if (tagName === 'style' && (element as HTMLStyleElement).sheet) {
    const cssText = getCssRulesString((element as HTMLStyleElement).sheet)
    if (cssText) {
      transaction.addMetric('cssText', cssText.length)
      attrs._cssText = cssText
    }
  }

  /**
   * Serialize the media playback state
   */
  if (tagName === 'audio' || tagName === 'video') {
    const mediaElement = element as HTMLMediaElement
    attrs.rr_mediaState = mediaElement.paused ? 'paused' : 'played'
  }

  /**
   * Serialize the scroll state for each element only for full snapshot
   */
  let scrollTop: number | undefined
  let scrollLeft: number | undefined
  switch (transaction.kind) {
    case SerializationKind.INITIAL_FULL_SNAPSHOT:
      scrollTop = Math.round(element.scrollTop)
      scrollLeft = Math.round(element.scrollLeft)
      if (scrollTop || scrollLeft) {
        transaction.scope.elementsScrollPositions.set(element, { scrollTop, scrollLeft })
      }
      break
    case SerializationKind.SUBSEQUENT_FULL_SNAPSHOT:
      if (transaction.scope.elementsScrollPositions.has(element)) {
        ;({ scrollTop, scrollLeft } = transaction.scope.elementsScrollPositions.get(element)!)
      }
      break
  }
  if (scrollLeft) {
    attrs.rr_scrollLeft = scrollLeft
  }
  if (scrollTop) {
    attrs.rr_scrollTop = scrollTop
  }

  return attrs
}

export function getCssRulesString(cssStyleSheet: CSSStyleSheet | undefined | null): string | null {
  if (!cssStyleSheet) {
    return null
  }
  let rules: CSSRuleList | undefined
  try {
    rules = cssStyleSheet.rules || cssStyleSheet.cssRules
  } catch {
    // if css is protected by CORS we cannot access cssRules see: https://www.w3.org/TR/cssom-1/#the-cssstylesheet-interface
  }
  if (!rules) {
    return null
  }
  const styleSheetCssText = Array.from(rules, isSafari() ? getCssRuleStringForSafari : getCssRuleString).join('')
  return switchToAbsoluteUrl(styleSheetCssText, cssStyleSheet.href)
}

function getCssRuleStringForSafari(rule: CSSRule): string {
  // Safari does not escape attribute selectors containing : properly
  // https://bugs.webkit.org/show_bug.cgi?id=184604
  if (isCSSStyleRule(rule) && rule.selectorText.includes(':')) {
    // This regex replaces [foo:bar] by [foo\\:bar]
    const escapeColon = /(\[[\w-]+[^\\])(:[^\]]+\])/g
    return rule.cssText.replace(escapeColon, '$1\\$2')
  }

  return getCssRuleString(rule)
}

function getCssRuleString(rule: CSSRule): string {
  // If it's an @import rule, try to inline sub-rules recursively with `getCssRulesString`. This
  // operation can fail if the imported stylesheet is protected by CORS, in which case we fallback
  // to the @import rule CSS text.
  return (isCSSImportRule(rule) && getCssRulesString(rule.styleSheet)) || rule.cssText
}

function isCSSImportRule(rule: CSSRule): rule is CSSImportRule {
  return 'styleSheet' in rule
}

function isCSSStyleRule(rule: CSSRule): rule is CSSStyleRule {
  return 'selectorText' in rule
}
