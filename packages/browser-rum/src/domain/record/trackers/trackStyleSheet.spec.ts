import { isFirefox, registerCleanupTask } from '@datadog/browser-core/test'
import { IncrementalSource, RecordType } from '../../../types'
import type { EmitRecordCallback } from '../record.types'
import type { RecordingScope } from '../recordingScope'
import { takeFullSnapshotForTesting } from '../test/serialization.specHelper'
import { createRecordingScopeForTesting } from '../test/recordingScope.specHelper'
import { trackStyleSheet, getPathToNestedCSSRule } from './trackStyleSheet'
import type { Tracker } from './tracker.types'

describe('trackStyleSheet', () => {
  let scope: RecordingScope
  let styleSheetTracker: Tracker
  let emitRecordCallback: jasmine.Spy<EmitRecordCallback>
  let styleElement: HTMLStyleElement
  let styleSheet: CSSStyleSheet
  const styleRule = '.selector-1 { color: #fff }'

  beforeEach(() => {
    styleElement = document.createElement('style')
    document.head.appendChild(styleElement)
    styleSheet = styleElement.sheet!

    emitRecordCallback = jasmine.createSpy()
    scope = createRecordingScopeForTesting()
    takeFullSnapshotForTesting(scope)

    registerCleanupTask(() => {
      styleSheetTracker?.stop()
      styleElement.remove()
    })
  })

  describe('observing high level css stylesheet', () => {
    describe('when inserting rules into stylesheet', () => {
      it('should capture CSSStyleRule insertion when no index is provided', () => {
        styleSheetTracker = trackStyleSheet(emitRecordCallback, scope)
        styleSheet.insertRule(styleRule)

        expect(emitRecordCallback).toHaveBeenCalledWith({
          type: RecordType.IncrementalSnapshot,
          timestamp: jasmine.any(Number),
          data: {
            id: jasmine.any(Number),
            source: IncrementalSource.StyleSheetRule,
            adds: [jasmine.objectContaining({ index: undefined })],
          },
        })
      })

      it('should capture CSSStyleRule insertion when index is provided', () => {
        const index = 0

        styleSheetTracker = trackStyleSheet(emitRecordCallback, scope)
        styleSheet.insertRule(styleRule, index)

        expect(emitRecordCallback).toHaveBeenCalledWith({
          type: RecordType.IncrementalSnapshot,
          timestamp: jasmine.any(Number),
          data: {
            id: jasmine.any(Number),
            source: IncrementalSource.StyleSheetRule,
            adds: [jasmine.objectContaining({ index })],
          },
        })
      })
    })

    describe('when removing rules from stylesheet', () => {
      it('should capture CSSStyleRule removal with the correct index', () => {
        styleSheet.insertRule(styleRule)
        const index = 0

        styleSheetTracker = trackStyleSheet(emitRecordCallback, scope)
        styleSheet.deleteRule(index)

        expect(emitRecordCallback).toHaveBeenCalledWith({
          type: RecordType.IncrementalSnapshot,
          timestamp: jasmine.any(Number),
          data: {
            id: jasmine.any(Number),
            source: IncrementalSource.StyleSheetRule,
            removes: [jasmine.objectContaining({ index })],
          },
        })
      })
    })
  })

  describe('observing CSSGroupingRules inside a CSSStyleSheet', () => {
    describe('when inserting CSSRules inside a CSSGroupingRule', () => {
      it('should capture CSSRule with the correct path when no index is provided', () => {
        styleSheet.insertRule('@media cond-2 { @media cond-1 { .nest-1 { color: #ccc } } }')
        styleSheet.insertRule('.main {opacity: 0}')
        const groupingRule = (styleSheet.cssRules[1] as CSSGroupingRule).cssRules[0] as CSSGroupingRule

        styleSheetTracker = trackStyleSheet(emitRecordCallback, scope)
        groupingRule.insertRule(styleRule, 1)

        expect(emitRecordCallback).toHaveBeenCalledWith({
          type: RecordType.IncrementalSnapshot,
          timestamp: jasmine.any(Number),
          data: {
            id: jasmine.any(Number),
            source: IncrementalSource.StyleSheetRule,
            adds: [jasmine.objectContaining({ index: [1, 0, 1] })],
          },
        })
      })

      it('should not create record when inserting into a detached CSSGroupingRule', () => {
        if (isFirefox()) {
          pending('Firefox does not support inserting rules in detached group')
        }

        styleSheet.insertRule('@media cond-2 { @media cond-1 { .nest-1 { color: #ccc } } }')

        const parentRule = styleSheet.cssRules[0] as CSSGroupingRule
        const groupingRule = parentRule.cssRules[0] as CSSGroupingRule
        parentRule.deleteRule(0)

        styleSheetTracker = trackStyleSheet(emitRecordCallback, scope)
        groupingRule.insertRule(styleRule, 0)

        expect(emitRecordCallback).not.toHaveBeenCalled()
      })
    })

    describe('when removing CSSRules from a CSSGroupingRule', () => {
      it('should capture CSSRule removal with the correct path', () => {
        styleSheet.insertRule('@media cond-2 { @media cond-1 { .nest-1 { color: #ccc } } }')
        styleSheet.insertRule('.main {opacity: 0}')
        const groupingRule = (styleSheet.cssRules[1] as CSSGroupingRule).cssRules[0] as CSSGroupingRule

        styleSheetTracker = trackStyleSheet(emitRecordCallback, scope)
        groupingRule.deleteRule(0)

        expect(emitRecordCallback).toHaveBeenCalledWith({
          type: RecordType.IncrementalSnapshot,
          timestamp: jasmine.any(Number),
          data: {
            id: jasmine.any(Number),
            source: IncrementalSource.StyleSheetRule,
            removes: [jasmine.objectContaining({ index: [1, 0, 0] })],
          },
        })
      })

      it('should not create record when removing from a detached CSSGroupingRule', () => {
        if (isFirefox()) {
          pending('Firefox does not support inserting rules in detached group')
        }

        styleSheet.insertRule('@media cond-2 { @media cond-1 { .nest-1 { color: #ccc } } }')

        const parentRule = styleSheet.cssRules[0] as CSSGroupingRule
        const groupingRule = parentRule.cssRules[0] as CSSGroupingRule
        parentRule.deleteRule(0)

        styleSheetTracker = trackStyleSheet(emitRecordCallback, scope)
        groupingRule.deleteRule(0)

        expect(emitRecordCallback).not.toHaveBeenCalled()
      })
    })
  })
})

const firstStyleRule = '.selector-1 { color: #aaa }'
const secondStyleRule = '.selector-2 { color: #bbb }'
const firstMediaRule = `
    @media cond-1 {
        .selector-3-1 { color: #ccc }
        .selector-3-2 { color: #ddd }
        .selector-3-3 { color: #eee }
    }`
const secondMediaRule = `
    @media cond-2 {
        @media cond-2-1 {.selector-2-1-1 { display: none }}
        @media cond-2-2 {.selector-2-2-1 { display: clock }}
    }`

describe('StyleSheetObserver > getPathToNestedCSSRule', () => {
  let styleSheet: CSSStyleSheet
  let styleElement: HTMLStyleElement
  beforeEach(() => {
    styleElement = document.createElement('style')
    document.head.appendChild(styleElement)
    styleSheet = styleElement.sheet!

    styleSheet.insertRule(secondMediaRule)
    styleSheet.insertRule(firstMediaRule)
    styleSheet.insertRule(secondStyleRule)
    styleSheet.insertRule(firstStyleRule)

    registerCleanupTask(() => {
      styleElement.remove()
    })
  })

  it('should return undefined if the rule is not attached to a parent StyleSheet', () => {
    const groupingRule = styleSheet.cssRules[3]
    expect(groupingRule.parentStyleSheet).toBeDefined()
    // Removing rule from CSSStyleSheet
    styleSheet.deleteRule(3)

    expect(groupingRule.parentStyleSheet).toEqual(null)
    expect(getPathToNestedCSSRule(groupingRule)).toBeUndefined()
  })

  it('should return path to high level CSSStyleRule', () => {
    expect(getPathToNestedCSSRule(styleSheet.cssRules[1])).toEqual([1])
  })

  it('should return path to high level CSSGroupingRule', () => {
    expect(getPathToNestedCSSRule(styleSheet.cssRules[3])).toEqual([3])
  })

  it('should return path to nested CSSStyleRule', () => {
    const rule = (styleSheet.cssRules[2] as CSSGroupingRule).cssRules[1]
    expect(getPathToNestedCSSRule(rule)).toEqual([2, 1])
  })

  it('should return path to nested CSSGroupingRule', () => {
    const rule = (styleSheet.cssRules[3] as CSSGroupingRule).cssRules[0]
    expect(getPathToNestedCSSRule(rule)).toEqual([3, 0])
  })

  it('should return path to leaf CSSRule', () => {
    const rule = ((styleSheet.cssRules[3] as CSSGroupingRule).cssRules[1] as CSSGroupingRule).cssRules[0]
    expect(getPathToNestedCSSRule(rule)).toEqual([3, 1, 0])
  })
})
