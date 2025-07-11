import { ONE_SECOND } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock } from '@datadog/browser-core/test'
import { FrustrationType } from '../../rawRumEvent.types'
import type { FakeClick } from '../../../test'
import { appendElement, createFakeClick } from '../../../test'
import { computeFrustration, isRage, isDead } from './computeFrustration'

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
      expect(getFrustrations(rageClick)).toEqual([FrustrationType.RAGE_CLICK])
    })

    it('adds a dead frustration to the rage click if any click does not have page activity', () => {
      clicksConsideredAsRage[1] = createFakeClick({ hasPageActivity: false })
      computeFrustration(clicksConsideredAsRage, rageClick)
      expect(getFrustrations(rageClick)).toEqual([FrustrationType.RAGE_CLICK, FrustrationType.DEAD_CLICK])
    })

    it('do not add a dead frustration to the rage click if clicks are associated with an "input" event', () => {
      clicksConsideredAsRage[1] = createFakeClick({ hasPageActivity: false, userActivity: { input: true } })
      computeFrustration(clicksConsideredAsRage, rageClick)
      expect(getFrustrations(rageClick)).toEqual([FrustrationType.RAGE_CLICK])
    })

    it('adds an error frustration to the rage click if an error occurs during the rage click lifetime', () => {
      rageClick = createFakeClick({ hasError: true })
      computeFrustration(clicksConsideredAsRage, rageClick)
      expect(getFrustrations(rageClick)).toEqual([FrustrationType.RAGE_CLICK, FrustrationType.ERROR_CLICK])
    })
  })

  describe('if clicks are not considered as rage', () => {
    it('does not add any frustration by default', () => {
      computeFrustration(clicks, rageClick)
      for (const click of clicks) {
        expect(getFrustrations(click)).toEqual([])
      }
    })

    it('adds a dead frustration to clicks that do not have activity', () => {
      clicks[1] = createFakeClick({ hasPageActivity: false })
      computeFrustration(clicks, rageClick)
      expect(getFrustrations(clicks[1])).toEqual([FrustrationType.DEAD_CLICK])
    })

    it('does not add a dead frustration when double clicking to select a word', () => {
      clicks[0] = createFakeClick({ userActivity: { selection: true } })
      clicks[1] = createFakeClick({ hasPageActivity: false })
      computeFrustration(clicks, rageClick)
      expect(getFrustrations(clicks[1])).toEqual([])
    })

    it('adds an error frustration to clicks that have an error', () => {
      clicks[1] = createFakeClick({ hasError: true })
      computeFrustration(clicks, rageClick)
      expect(getFrustrations(clicks[1])).toEqual([FrustrationType.ERROR_CLICK])
    })
  })

  function getFrustrations(click: FakeClick) {
    return click.addFrustration.calls.allArgs().map((args) => args[0])
  }
})

describe('isRage', () => {
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
  })

  it('considers as rage three clicks happening at the same time', () => {
    expect(isRage([createFakeClick(), createFakeClick(), createFakeClick()])).toBe(true)
  })

  it('does not consider as rage when triple clicking to select a paragraph', () => {
    expect(isRage([createFakeClick(), createFakeClick({ userActivity: { selection: true } }), createFakeClick()])).toBe(
      false
    )
  })

  it('does not consider rage when at least one click is related to a "scroll" event', () => {
    expect(isRage([createFakeClick(), createFakeClick({ userActivity: { scroll: true } }), createFakeClick()])).toBe(
      false
    )
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

describe('isDead', () => {
  it('considers as dead when the click has no page activity', () => {
    expect(isDead(createFakeClick({ hasPageActivity: false }))).toBe(true)
  })

  it('does not consider as dead when the click has page activity', () => {
    expect(isDead(createFakeClick({ hasPageActivity: true }))).toBe(false)
  })

  it('does not consider as dead when the click is related to an "input" event', () => {
    expect(isDead(createFakeClick({ hasPageActivity: false, userActivity: { input: true } }))).toBe(false)
  })

  it('does not consider as dead when the click is related to a "scroll" event', () => {
    expect(isDead(createFakeClick({ hasPageActivity: false, userActivity: { scroll: true } }))).toBe(false)
  })

  for (const { element, expected } of [
    { element: '<input />', expected: false },
    { element: '<textarea />', expected: false },
    { element: '<input type="checkbox" />', expected: true },
    { element: '<input type="password" />', expected: false },
    { element: '<canvas  />', expected: false },
    { element: '<a id="foo">Foo</a>', expected: true },
    { element: '<a href="foo">Foo</a>', expected: false },
    { element: '<a href="foo">Foo<span target>bar</span></a>', expected: false },
    { element: '<div contenteditable>Foo bar</div>', expected: false },
    { element: '<div contenteditable>Foo<span target>bar</span></div>', expected: false },
  ]) {
    it(`does not consider as dead when the click target is ${element}`, () => {
      expect(
        isDead(
          createFakeClick({
            hasPageActivity: false,
            event: { target: appendElement(element) },
          })
        )
      ).toBe(expected)
    })
  }

  describe('label elements', () => {
    it('does not consider as dead when the click target is a label referring to a text input', () => {
      appendElement('<input type="text" id="test-input" />')
      const label = appendElement('<label for="test-input">Click me</label>')

      expect(
        isDead(
          createFakeClick({
            hasPageActivity: false,
            event: { target: label },
          })
        )
      ).toBe(false)
    })

    it('considers as dead when the click target is a label referring to a checkbox', () => {
      appendElement('<input type="checkbox" id="test-checkbox" />')
      const label = appendElement('<label for="test-checkbox">Check me</label>')

      expect(
        isDead(
          createFakeClick({
            hasPageActivity: false,
            event: { target: label },
          })
        )
      ).toBe(true)
    })

    it('considers as dead when the click target is a label referring to a non-existent element', () => {
      const label = appendElement('<label for="non-existent-id">Click me</label>')

      expect(
        isDead(
          createFakeClick({
            hasPageActivity: false,
            event: { target: label },
          })
        )
      ).toBe(true)
    })
  })
})
