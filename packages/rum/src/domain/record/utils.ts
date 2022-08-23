import { assign, timeStampNow } from '@datadog/browser-core'
import type { BrowserIncrementalData, BrowserIncrementalSnapshotRecord } from '../../types'
import { RecordType } from '../../types'
import { getSerializedNodeId, hasSerializedNode } from './serializationUtils'

export function isTouchEvent(event: MouseEvent | TouchEvent): event is TouchEvent {
  return Boolean((event as TouchEvent).changedTouches)
}

export function forEach<List extends { [index: number]: any }>(
  list: List,
  callback: (value: List[number], index: number, parent: List) => void
) {
  Array.prototype.forEach.call(list, callback as any)
}

export function assembleIncrementalSnapshot<Data extends BrowserIncrementalData>(
  source: Data['source'],
  data: Omit<Data, 'source'>
): BrowserIncrementalSnapshotRecord {
  return {
    data: assign(
      {
        source,
      },
      data
    ) as Data,
    type: RecordType.IncrementalSnapshot,
    timestamp: timeStampNow(),
  }
}

export function checkStyleSheetAndCallback(styleSheet: CSSStyleSheet | null, callback: (id: number) => void): void {
  if (styleSheet && hasSerializedNode(styleSheet.ownerNode!)) {
    callback(getSerializedNodeId(styleSheet.ownerNode))
  }
}

/*
 * We can ignore CSSCondition rule in this work around
 * (see https://caniuse.com/?search=cssconditionrule & https://caniuse.com/?search=cssgroupingrule)
 * if CSSGroupingRule is defined, there is no need to each sub interface (CSSMediaRule, CSSSupprtsRule,
 * CSSConditionRule). if CSSGroupingRule is not defined, CSSConditionRule is not defined neither and we
 * fall back to supported rules only
 */

export type GroupingCSSRuleTypes = typeof CSSGroupingRule | typeof CSSMediaRule | typeof CSSSupportsRule
export type GroupingCSSRule = CSSGroupingRule | CSSSupportsRule | CSSMediaRule

export const isCSSGroupingRuleSupported = typeof CSSGroupingRule !== 'undefined'
export const isCSSMediaRuleSupported = typeof CSSMediaRule !== 'undefined'
export const isCSSSupportsRuleSupported = typeof CSSSupportsRule !== 'undefined'

export function isNestedRulesSupported() {
  return isCSSGroupingRuleSupported || isCSSMediaRuleSupported || isCSSSupportsRuleSupported
}

export function getSupportedCSSRuleTypes() {
  if (isCSSGroupingRuleSupported) {
    return [CSSGroupingRule]
  }
  const supported = []
  if (isCSSSupportsRuleSupported) {
    supported.push(CSSSupportsRule)
  }
  if (isCSSMediaRuleSupported) {
    supported.push(CSSMediaRule)
  }

  return supported
}

export function getPathToNestedCSSRule(rule: CSSRule): number[] | undefined {
  const path: number[] = []
  let currentRule = rule
  while (currentRule.parentRule) {
    const rules = Array.from((currentRule.parentRule as GroupingCSSRule).cssRules)
    const index = rules.indexOf(currentRule)
    path.unshift(index)
    currentRule = currentRule.parentRule
  }
  // A rule may not be attached to a stylesheet
  if (!currentRule.parentStyleSheet) {
    return
  }

  const rules = Array.from(currentRule.parentStyleSheet.cssRules)
  const index = rules.indexOf(currentRule)
  path.unshift(index)

  return path
}
