import { assign, timeStampNow } from '@datadog/browser-core'
import type { BrowserIncrementalData, BrowserIncrementalSnapshotRecord } from '../../types'
import { RecordType } from '../../types'

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

export type GroupingCSSRule = CSSGroupingRule | CSSSupportsRule | CSSMediaRule

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
