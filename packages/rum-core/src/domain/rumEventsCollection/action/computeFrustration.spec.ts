import { ONE_SECOND, timeStampNow } from '@datadog/browser-core'
import { FrustrationType } from '../../../rawRumEvent.types'
import type { Clock } from '../../../../../core/test/specHelper'
import { createNewEvent, mockClock } from '../../../../../core/test/specHelper'
import { computeFrustration, isRage } from './computeFrustration'
import type { Click } from './trackClickActions'

describe('computeFrustration', () => {
  let clicks: Array<ReturnType<typeof createFakeClick>>
  let clicksConsideredAsRage: Array<ReturnType<typeof createFakeClick>>
  let rageClick: ReturnType<typeof createFakeClick>

  beforeEach(() => {
    clicks = [createFakeClick(), createFakeClick()]
    clicksConsideredAsRage = [createFakeClick(), createFakeClick(), createFakeClick()]
    rageClick = createFakeClick()
  })

  it('returns whether the clicks are considered as rage', () => {
    expect(computeFrustration(clicksConsideredAsRage, rageClick).isRage).toBeTrue()
    expect(computeFrustration(clicks, rageClick).isRage).toBeFalse()
  })

  describe('if clicks are considered as rage', () => {
    it('adds a rage frustration to the rage click', () => {
      computeFrustration(clicksConsideredAsRage, rageClick)
      expect(rageClick.frustrationTypes).toEqual([FrustrationType.RAGE_CLICK])
    })

    it('adds a dead frustration to the rage click if any click does not have activity', () => {
      clicksConsideredAsRage[1].hasActivity = false
      computeFrustration(clicksConsideredAsRage, rageClick)
      expect(rageClick.frustrationTypes).toEqual([FrustrationType.RAGE_CLICK, FrustrationType.DEAD_CLICK])
    })

    it('adds an error frustration to the rage click if any click does not have activity', () => {
      rageClick.hasError = true
      computeFrustration(clicksConsideredAsRage, rageClick)
      expect(rageClick.frustrationTypes).toEqual([FrustrationType.RAGE_CLICK, FrustrationType.ERROR_CLICK])
    })
  })

  describe('if clicks are not considered as rage', () => {
    it('does not add any frustration by default', () => {
      computeFrustration(clicks, rageClick)
      for (const click of clicks) {
        expect(click.frustrationTypes).toEqual([])
      }
    })

    it('adds a dead frustration to clicks that do not have activity', () => {
      clicks[1].hasActivity = false
      computeFrustration(clicks, rageClick)
      expect(clicks[1].frustrationTypes).toEqual([FrustrationType.DEAD_CLICK])
    })

    it('does not add a dead frustration to clicks if one of them is associated with a selection change', () => {
      clicks[1].hasActivity = false
      clicks[0].hasSelectionChanged = true
      computeFrustration(clicks, rageClick)
      expect(clicks[1].frustrationTypes).toEqual([])
    })

    it('adds an error frustration to clicks that have an error', () => {
      clicks[1].hasError = true
      computeFrustration(clicks, rageClick)
      expect(clicks[1].frustrationTypes).toEqual([FrustrationType.ERROR_CLICK])
    })
  })
})

describe('isRage', () => {
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
  })

  afterEach(() => {
    clock.cleanup()
  })

  it('considers as rage three clicks happening at the same time', () => {
    expect(isRage([createFakeClick(), createFakeClick(), createFakeClick()])).toBe(true)
  })

  it('considers as rage three clicks if one of them has selection change', () => {
    expect(isRage([createFakeClick(), createFakeClick({ hasSelectionChanged: true }), createFakeClick()])).toBe(false)
  })

  it('does not consider as rage two clicks happening at the same time', () => {
    expect(isRage([createFakeClick(), createFakeClick()])).toBe(false)
  })

  it('does not consider as rage a first click long before two fast clicks', () => {
    const clicks = [createFakeClick()]
    clock.tick(ONE_SECOND * 2)
    clicks.push(createFakeClick(), createFakeClick())

    expect(isRage(clicks)).toBe(false)
  })

  it('considers as rage a first click long before three fast clicks', () => {
    const clicks = [createFakeClick()]
    clock.tick(ONE_SECOND * 2)
    clicks.push(createFakeClick(), createFakeClick(), createFakeClick())

    expect(isRage(clicks)).toBe(true)
  })

  it('considers as rage three fast clicks long before a last click', () => {
    const clicks = [createFakeClick(), createFakeClick(), createFakeClick()]
    clock.tick(ONE_SECOND * 2)
    clicks.push(createFakeClick())

    expect(isRage(clicks)).toBe(true)
  })
})

function createFakeClick(partialClick: Partial<Click> = {}) {
  const frustrationTypes: FrustrationType[] = []

  const click: Partial<Click> = {
    event: createNewEvent('click', {
      target: document.body,
      timeStamp: timeStampNow(),
    }),
    hasError: false,
    hasActivity: true,
    hasSelectionChanged: false,
    addFrustration: (frustrationType: FrustrationType) => frustrationTypes.push(frustrationType),
    ...partialClick,
  }

  return {
    ...(click as Click),
    frustrationTypes,
  }
}
