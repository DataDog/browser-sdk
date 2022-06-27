import { ONE_SECOND } from '@datadog/browser-core'
import { FrustrationType } from '../../../rawRumEvent.types'
import type { Clock } from '../../../../../core/test/specHelper'
import { mockClock } from '../../../../../core/test/specHelper'
import type { FakeClick } from '../../../../test/createFakeClick'
import { createFakeClick } from '../../../../test/createFakeClick'
import { computeFrustration, isRage } from './computeFrustration'

describe('computeFrustration', () => {
  let clicks: FakeClick[]
  let clicksConsideredAsRage: FakeClick[]
  let rageClick: FakeClick

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
      expect(rageClick.addFrustration).toHaveBeenCalledOnceWith(FrustrationType.RAGE_CLICK)
    })

    it('adds a dead frustration to the rage click if any click does not have activity', () => {
      clicksConsideredAsRage[1].hasActivity = false
      computeFrustration(clicksConsideredAsRage, rageClick)
      expect(rageClick.addFrustration).toHaveBeenCalledTimes(2)
      expect(rageClick.addFrustration.calls.argsFor(0)).toEqual([FrustrationType.RAGE_CLICK])
      expect(rageClick.addFrustration.calls.argsFor(1)).toEqual([FrustrationType.DEAD_CLICK])
    })

    it('adds an error frustration to the rage click if any click does not have activity', () => {
      rageClick.hasError = true
      computeFrustration(clicksConsideredAsRage, rageClick)
      expect(rageClick.addFrustration).toHaveBeenCalledTimes(2)
      expect(rageClick.addFrustration.calls.argsFor(0)).toEqual([FrustrationType.RAGE_CLICK])
      expect(rageClick.addFrustration.calls.argsFor(1)).toEqual([FrustrationType.ERROR_CLICK])
    })
  })

  describe('if clicks are not considered as rage', () => {
    it('does not add any frustration by default', () => {
      computeFrustration(clicks, rageClick)
      for (const click of clicks) {
        expect(click.addFrustration).not.toHaveBeenCalled()
      }
    })

    it('adds a dead frustration to clicks that do not have activity', () => {
      clicks[1].hasActivity = false
      computeFrustration(clicks, rageClick)
      expect(clicks[1].addFrustration).toHaveBeenCalledOnceWith(FrustrationType.DEAD_CLICK)
    })

    it('does not add a dead frustration when double clicking to select a word', () => {
      clicks[1].hasActivity = false
      clicks[0].hasSelectionChanged = true
      computeFrustration(clicks, rageClick)
      expect(clicks[1].addFrustration).not.toHaveBeenCalled()
    })

    it('adds an error frustration to clicks that have an error', () => {
      clicks[1].hasError = true
      computeFrustration(clicks, rageClick)
      expect(clicks[1].addFrustration).toHaveBeenCalledOnceWith(FrustrationType.ERROR_CLICK)
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

  it('does not consider as rage when triple clicking to select a paragraph', () => {
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
