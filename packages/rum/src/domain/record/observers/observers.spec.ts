import { isIE, noop, relativeNow, timeStampNow } from '@datadog/browser-core'
import type { RawRumActionEvent, RumConfiguration } from '@datadog/browser-rum-core'
import { ActionType, LifeCycle, LifeCycleEventType, RumEventType, FrustrationType } from '@datadog/browser-rum-core'
import type { RawRumEventCollectedData } from 'packages/rum-core/src/domain/lifeCycle'
import { isFirefox } from '@datadog/browser-core/test/specHelper'
import { NodePrivacyLevel } from '../../../constants'
import { RecordType } from '../../../types'
import { serializeDocument, SerializationContextStatus } from '../serialize'
import { createElementsScrollPositions } from '../elementsScrollPositions'
import type { ShadowRootsController } from '../shadowRootsController'
import { getRecordIdForEvent } from '../utils'
import { initStyleSheetObserver, initFrustrationObserver } from './observers'
import type { FrustrationCallback, StyleSheetCallback } from './observers'

const DEFAULT_SHADOW_ROOT_CONTROLLER: ShadowRootsController = {
  flush: noop,
  stop: noop,
  addShadowRoot: noop,
  removeShadowRoot: noop,
}

const DEFAULT_CONFIGURATION = { defaultPrivacyLevel: NodePrivacyLevel.ALLOW } as RumConfiguration

describe('initFrustrationObserver', () => {
  const lifeCycle = new LifeCycle()
  let stopFrustrationObserver: () => void
  let frustrationsCallbackSpy: jasmine.Spy<FrustrationCallback>
  let mouseEvent: MouseEvent
  let rumData: RawRumEventCollectedData<RawRumActionEvent>

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
    mouseEvent = new MouseEvent('pointerup')
    frustrationsCallbackSpy = jasmine.createSpy()

    rumData = {
      startTime: relativeNow(),
      rawRumEvent: {
        date: timeStampNow(),
        type: RumEventType.ACTION,
        action: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          type: ActionType.CLICK,
          frustration: {
            type: [FrustrationType.DEAD_CLICK],
          },
          target: {
            name: '123e4567-e89b-12d3-a456-426614174000',
          },
        },
      },
      domainContext: { event: mouseEvent, events: [mouseEvent] },
    }
  })

  afterEach(() => {
    stopFrustrationObserver()
  })

  it('calls callback if the raw data inserted is a click action', () => {
    stopFrustrationObserver = initFrustrationObserver(lifeCycle, frustrationsCallbackSpy)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)

    const frustrationRecord = frustrationsCallbackSpy.calls.first().args[0]
    expect(frustrationRecord.type).toEqual(RecordType.FrustrationRecord)
    expect(frustrationRecord.timestamp).toEqual(rumData.rawRumEvent.date)
    expect(frustrationRecord.data.frustrationTypes).toEqual(rumData.rawRumEvent.action.frustration!.type)
    expect(frustrationRecord.data.recordIds).toEqual([getRecordIdForEvent(mouseEvent)])
  })

  it('ignores events other than click actions', () => {
    rumData.rawRumEvent.action.type = ActionType.CUSTOM
    stopFrustrationObserver = initFrustrationObserver(lifeCycle, frustrationsCallbackSpy)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)

    expect(frustrationsCallbackSpy).not.toHaveBeenCalled()
  })

  it('ignores click actions without frustrations', () => {
    rumData.rawRumEvent.action.frustration = { type: [] }

    stopFrustrationObserver = initFrustrationObserver(lifeCycle, frustrationsCallbackSpy)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)

    expect(frustrationsCallbackSpy).not.toHaveBeenCalled()
  })

  it('ignores click actions which are missing the original mouse events', () => {
    rumData.domainContext = {}

    stopFrustrationObserver = initFrustrationObserver(lifeCycle, frustrationsCallbackSpy)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, rumData)

    expect(frustrationsCallbackSpy).not.toHaveBeenCalled()
  })
})

describe('initStyleSheetObserver', () => {
  let stopStyleSheetObserver: () => void
  let styleSheetCallbackSpy: jasmine.Spy<StyleSheetCallback>
  let styleElement: HTMLStyleElement
  let styleSheet: CSSStyleSheet
  const styleRule = '.selector-1 { color: #fff }'

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
    styleSheetCallbackSpy = jasmine.createSpy()
    styleElement = document.createElement('style')
    document.head.appendChild(styleElement)
    styleSheet = styleElement.sheet!

    serializeDocument(document, DEFAULT_CONFIGURATION, {
      shadowRootsController: DEFAULT_SHADOW_ROOT_CONTROLLER,
      status: SerializationContextStatus.INITIAL_FULL_SNAPSHOT,
      elementsScrollPositions: createElementsScrollPositions(),
    })
  })

  afterEach(() => {
    stopStyleSheetObserver()
    styleElement.remove()
  })

  describe('observing high level css stylesheet', () => {
    describe('when inserting rules into stylesheet', () => {
      it('should capture CSSStyleRule insertion when no index is provided', () => {
        stopStyleSheetObserver = initStyleSheetObserver(styleSheetCallbackSpy)
        styleSheet.insertRule(styleRule)

        const styleSheetRule = styleSheetCallbackSpy.calls.first().args[0]
        expect(styleSheetRule.id).toBeDefined()
        expect(styleSheetRule.removes).toBeUndefined()
        expect(styleSheetRule.adds?.length).toEqual(1)
        expect(styleSheetRule.adds?.[0]?.index).toEqual(undefined)
      })

      it('should capture CSSStyleRule insertion when index is provided', () => {
        const index = 0

        stopStyleSheetObserver = initStyleSheetObserver(styleSheetCallbackSpy)
        styleSheet.insertRule(styleRule, index)

        const styleSheetRule = styleSheetCallbackSpy.calls.first().args[0]
        expect(styleSheetRule.id).toBeDefined()
        expect(styleSheetRule.removes).toBeUndefined()
        expect(styleSheetRule.adds?.length).toEqual(1)
        expect(styleSheetRule.adds?.[0]?.index).toEqual(index)
      })
    })

    describe('when removing rules from stylesheet', () => {
      it('should capture CSSStyleRule removal with the correct index', () => {
        styleSheet.insertRule(styleRule)
        const index = 0

        stopStyleSheetObserver = initStyleSheetObserver(styleSheetCallbackSpy)
        styleSheet.deleteRule(index)

        const styleSheetRule = styleSheetCallbackSpy.calls.first().args[0]
        expect(styleSheetRule.id).toBeDefined()
        expect(styleSheetRule.adds).toBeUndefined()
        expect(styleSheetRule.removes?.length).toEqual(1)
        expect(styleSheetRule.removes?.[0]).toEqual({ index })
      })
    })
  })

  describe('observing CSSGroupingRules inside a CSSStyleSheet', () => {
    describe('when inserting CSSRules inside a CSSGroupingRule', () => {
      it('should capture CSSRule with the correct path when no index is provided', () => {
        styleSheet.insertRule('@media cond-2 { @media cond-1 { .nest-1 { color: #ccc } } }')
        styleSheet.insertRule('.main {opacity: 0}')
        const groupingRule = (styleSheet.cssRules[1] as CSSGroupingRule).cssRules[0] as CSSGroupingRule

        stopStyleSheetObserver = initStyleSheetObserver(styleSheetCallbackSpy)
        groupingRule.insertRule(styleRule, 1)

        const styleSheetRule = styleSheetCallbackSpy.calls.first().args[0]
        expect(styleSheetRule.id).toBeDefined()
        expect(styleSheetRule.removes).toBeUndefined()
        expect(styleSheetRule.adds?.length).toEqual(1)
        expect(styleSheetRule.adds?.[0]?.index).toEqual([1, 0, 1])
      })

      it('should not create record when inserting into a detached CSSGroupingRule', () => {
        if (isFirefox()) {
          pending('Firefox does not support inserting rules in detached group')
        }

        styleSheet.insertRule('@media cond-2 { @media cond-1 { .nest-1 { color: #ccc } } }')

        const parentRule = styleSheet.cssRules[0] as CSSGroupingRule
        const groupingRule = parentRule.cssRules[0] as CSSGroupingRule
        parentRule.deleteRule(0)

        stopStyleSheetObserver = initStyleSheetObserver(styleSheetCallbackSpy)
        groupingRule.insertRule(styleRule, 0)

        expect(styleSheetCallbackSpy).not.toHaveBeenCalled()
      })
    })

    describe('when removing CSSRules from a CSSGroupingRule', () => {
      it('should capture CSSRule removal with the correct path', () => {
        styleSheet.insertRule('@media cond-2 { @media cond-1 { .nest-1 { color: #ccc } } }')
        styleSheet.insertRule('.main {opacity: 0}')
        const groupingRule = (styleSheet.cssRules[1] as CSSGroupingRule).cssRules[0] as CSSGroupingRule

        stopStyleSheetObserver = initStyleSheetObserver(styleSheetCallbackSpy)
        groupingRule.deleteRule(0)

        const styleSheetRule = styleSheetCallbackSpy.calls.first().args[0]
        expect(styleSheetRule.id).toBeDefined()
        expect(styleSheetRule.adds).toBeUndefined()
        expect(styleSheetRule.removes?.length).toEqual(1)
        expect(styleSheetRule.removes?.[0]?.index).toEqual([1, 0, 0])
      })

      it('should not create record when removing from a detached CSSGroupingRule', () => {
        if (isFirefox()) {
          pending('Firefox does not support inserting rules in detached group')
        }

        styleSheet.insertRule('@media cond-2 { @media cond-1 { .nest-1 { color: #ccc } } }')

        const parentRule = styleSheet.cssRules[0] as CSSGroupingRule
        const groupingRule = parentRule.cssRules[0] as CSSGroupingRule
        parentRule.deleteRule(0)

        stopStyleSheetObserver = initStyleSheetObserver(styleSheetCallbackSpy)
        groupingRule.deleteRule(0)

        expect(styleSheetCallbackSpy).not.toHaveBeenCalled()
      })
    })
  })
})
