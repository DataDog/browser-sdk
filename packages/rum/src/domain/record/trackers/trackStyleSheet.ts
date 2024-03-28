import { instrumentMethod } from '@datadog/browser-core'
import { IncrementalSource } from '../../../types'
import type { StyleSheetRuleData, BrowserIncrementalSnapshotRecord } from '../../../types'
import { getSerializedNodeId, hasSerializedNode } from '../serialization'
import { assembleIncrementalSnapshot } from '../assembly'
import type { Tracker } from './types'

type GroupingCSSRuleTypes = typeof CSSGroupingRule | typeof CSSMediaRule | typeof CSSSupportsRule

export type StyleSheetCallback = (incrementalSnapshotRecord: BrowserIncrementalSnapshotRecord) => void

export function trackStyleSheet(styleSheetCb: StyleSheetCallback): Tracker {
  function checkStyleSheetAndCallback(styleSheet: CSSStyleSheet | null, callback: (id: number) => void): void {
    if (styleSheet && hasSerializedNode(styleSheet.ownerNode!)) {
      callback(getSerializedNodeId(styleSheet.ownerNode))
    }
  }

  const instrumentationStoppers = [
    instrumentMethod(CSSStyleSheet.prototype, 'insertRule', ({ target: styleSheet, parameters: [rule, index] }) => {
      checkStyleSheetAndCallback(styleSheet, (id) =>
        styleSheetCb(
          assembleIncrementalSnapshot<StyleSheetRuleData>(IncrementalSource.StyleSheetRule, {
            id,
            adds: [{ rule, index }],
          })
        )
      )
    }),

    instrumentMethod(CSSStyleSheet.prototype, 'deleteRule', ({ target: styleSheet, parameters: [index] }) => {
      checkStyleSheetAndCallback(styleSheet, (id) =>
        styleSheetCb(
          assembleIncrementalSnapshot<StyleSheetRuleData>(IncrementalSource.StyleSheetRule, {
            id,
            removes: [{ index }],
          })
        )
      )
    }),
  ]

  if (typeof CSSGroupingRule !== 'undefined') {
    instrumentGroupingCSSRuleClass(CSSGroupingRule)
  } else {
    instrumentGroupingCSSRuleClass(CSSMediaRule)
    instrumentGroupingCSSRuleClass(CSSSupportsRule)
  }

  function instrumentGroupingCSSRuleClass(cls: GroupingCSSRuleTypes) {
    instrumentationStoppers.push(
      instrumentMethod(cls.prototype, 'insertRule', ({ target: styleSheet, parameters: [rule, index] }) => {
        checkStyleSheetAndCallback(styleSheet.parentStyleSheet, (id) => {
          const path = getPathToNestedCSSRule(styleSheet)
          if (path) {
            path.push(index || 0)
            styleSheetCb(
              assembleIncrementalSnapshot<StyleSheetRuleData>(IncrementalSource.StyleSheetRule, {
                id,
                adds: [{ rule, index: path }],
              })
            )
          }
        })
      }),

      instrumentMethod(cls.prototype, 'deleteRule', ({ target: styleSheet, parameters: [index] }) => {
        checkStyleSheetAndCallback(styleSheet.parentStyleSheet, (id) => {
          const path = getPathToNestedCSSRule(styleSheet)
          if (path) {
            path.push(index)
            styleSheetCb(
              assembleIncrementalSnapshot<StyleSheetRuleData>(IncrementalSource.StyleSheetRule, {
                id,
                removes: [{ index: path }],
              })
            )
          }
        })
      })
    )
  }

  return {
    stop: () => {
      instrumentationStoppers.forEach((stopper) => stopper.stop())
    },
  }
}

export function getPathToNestedCSSRule(rule: CSSRule): number[] | undefined {
  const path: number[] = []
  let currentRule = rule
  while (currentRule.parentRule) {
    const rules = Array.from((currentRule.parentRule as CSSGroupingRule).cssRules)
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
