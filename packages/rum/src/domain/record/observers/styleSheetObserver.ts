import type { ListenerHandler } from '@datadog/browser-core'
import { instrumentMethodAndCallOriginal } from '@datadog/browser-core'
import type { StyleSheetRule } from '../../../types'
import { getSerializedNodeId, hasSerializedNode } from '../serialization'

type GroupingCSSRuleTypes = typeof CSSGroupingRule | typeof CSSMediaRule | typeof CSSSupportsRule

export type StyleSheetCallback = (s: StyleSheetRule) => void

export function initStyleSheetObserver(cb: StyleSheetCallback): ListenerHandler {
  function checkStyleSheetAndCallback(styleSheet: CSSStyleSheet | null, callback: (id: number) => void): void {
    if (styleSheet && hasSerializedNode(styleSheet.ownerNode!)) {
      callback(getSerializedNodeId(styleSheet.ownerNode))
    }
  }

  const instrumentationStoppers = [
    instrumentMethodAndCallOriginal(CSSStyleSheet.prototype, 'insertRule', {
      before(rule, index) {
        checkStyleSheetAndCallback(this, (id) => cb({ id, adds: [{ rule, index }] }))
      },
    }),
    instrumentMethodAndCallOriginal(CSSStyleSheet.prototype, 'deleteRule', {
      before(index) {
        checkStyleSheetAndCallback(this, (id) => cb({ id, removes: [{ index }] }))
      },
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
      instrumentMethodAndCallOriginal(cls.prototype, 'insertRule', {
        before(rule, index) {
          checkStyleSheetAndCallback(this.parentStyleSheet, (id) => {
            const path = getPathToNestedCSSRule(this)
            if (path) {
              path.push(index || 0)
              cb({ id, adds: [{ rule, index: path }] })
            }
          })
        },
      }),
      instrumentMethodAndCallOriginal(cls.prototype, 'deleteRule', {
        before(index) {
          checkStyleSheetAndCallback(this.parentStyleSheet, (id) => {
            const path = getPathToNestedCSSRule(this)
            if (path) {
              path.push(index)
              cb({ id, removes: [{ index: path }] })
            }
          })
        },
      })
    )
  }

  return () => instrumentationStoppers.forEach((stopper) => stopper.stop())
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
