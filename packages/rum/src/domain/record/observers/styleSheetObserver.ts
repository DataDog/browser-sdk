import { instrumentMethodAndCallOriginal } from '@datadog/browser-core'
import type { StyleSheetRule } from '../../../types'
import { getSerializedNodeId, hasSerializedNode } from '../serializationUtils'
import { getPathToNestedCSSRule } from '../utils'
import type { ListenerHandler } from './utils'

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
