import { NodePrivacyLevel, shouldMaskNode } from '@datadog/browser-rum-core'
import { isSafari } from '@datadog/browser-core'
import { getElementInputValue, switchToAbsoluteUrl, getValidTagName } from './serializationUtils'
import type { SerializeOptions } from './serialization.types'
import { SerializationContextStatus } from './serialization.types'
import { serializeAttribute } from './serializeAttribute'

export function serializeAttributes(
  element: Element,
  nodePrivacyLevel: NodePrivacyLevel,
  options: SerializeOptions
): Record<string, string | number | boolean> {
  if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
    return {}
  }
  const safeAttrs: Record<string, string | number | boolean> = {}
  const tagName = getValidTagName(element.tagName)
  const doc = element.ownerDocument

  for (let i = 0; i < element.attributes.length; i += 1) {
    const attribute = element.attributes.item(i)!
    const attributeName = attribute.name
    const attributeValue = serializeAttribute(element, nodePrivacyLevel, attributeName, options.configuration)
    if (attributeValue !== null) {
      safeAttrs[attributeName] = attributeValue
    }
  }

  if (
    (element as HTMLInputElement).value &&
    (tagName === 'textarea' || tagName === 'select' || tagName === 'option' || tagName === 'input')
  ) {
    const formValue = getElementInputValue(element, nodePrivacyLevel)
    if (formValue !== undefined) {
      safeAttrs.value = formValue
    }
  }

  /**
   * <Option> can be selected, which occurs if its `value` matches ancestor `<Select>.value`
   */
  if (tagName === 'option' && nodePrivacyLevel === NodePrivacyLevel.ALLOW) {
    // For privacy=`MASK`, all the values would be the same, so skip.
    const optionElement = element as HTMLOptionElement
    if (optionElement.selected) {
      safeAttrs.selected = optionElement.selected
    }
  }

  // remote css
  if (tagName === 'link') {
    const stylesheet = Array.from(doc.styleSheets).find((s) => s.href === (element as HTMLLinkElement).href)
    const cssText = getCssRulesString(stylesheet)
    if (cssText && stylesheet) {
      safeAttrs._cssText = cssText
    }
  }

  // dynamic stylesheet
  if (tagName === 'style' && (element as HTMLStyleElement).sheet) {
    const cssText = getCssRulesString((element as HTMLStyleElement).sheet)
    if (cssText) {
      safeAttrs._cssText = cssText
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
    if (nodePrivacyLevel === NodePrivacyLevel.ALLOW) {
      safeAttrs.checked = !!inputElement.checked
    } else if (shouldMaskNode(inputElement, nodePrivacyLevel)) {
      delete safeAttrs.checked
    }
  }

  /**
   * Serialize the media playback state
   */
  if (tagName === 'audio' || tagName === 'video') {
    const mediaElement = element as HTMLMediaElement
    safeAttrs.rr_mediaState = mediaElement.paused ? 'paused' : 'played'
  }

  /**
   * Serialize the scroll state for each element only for full snapshot
   */
  let scrollTop: number | undefined
  let scrollLeft: number | undefined
  const serializationContext = options.serializationContext
  switch (serializationContext.status) {
    case SerializationContextStatus.INITIAL_FULL_SNAPSHOT:
      scrollTop = Math.round(element.scrollTop)
      scrollLeft = Math.round(element.scrollLeft)
      if (scrollTop || scrollLeft) {
        serializationContext.elementsScrollPositions.set(element, { scrollTop, scrollLeft })
      }
      break
    case SerializationContextStatus.SUBSEQUENT_FULL_SNAPSHOT:
      if (serializationContext.elementsScrollPositions.has(element)) {
        ;({ scrollTop, scrollLeft } = serializationContext.elementsScrollPositions.get(element)!)
      }
      break
  }
  if (scrollLeft) {
    safeAttrs.rr_scrollLeft = scrollLeft
  }
  if (scrollTop) {
    safeAttrs.rr_scrollTop = scrollTop
  }

  return safeAttrs
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
