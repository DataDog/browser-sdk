import { computeFrustration, isInteractiveElement, RAGE_CLICK_THRESHOLD } from './computeFrustration'
import type { PendingClick } from './clickChain'

function makeClick(overrides: Partial<PendingClick> = {}): PendingClick {
  return {
    name: 'Click',
    targetSelector: 'button.submit',
    positionX: 100,
    positionY: 200,
    startTime: 0,
    startDate: 0,
    pointerUpDelay: 10,
    nameSource: 'text_content',
    targetWidth: 100,
    targetHeight: 40,
    activity: { hadActivity: true, endTime: 100 },
    errorCount: 0,
    resourceCount: 0,
    longTaskCount: 0,
    ...overrides,
  }
}

describe('computeFrustration', () => {
  it('no frustration for single click with activity', () => {
    const click = makeClick({ activity: { hadActivity: true, endTime: 100 } })
    const result = computeFrustration([click])

    expect(result.isRage).toBe(false)
    expect(result.actions.length).toBe(1)
    expect(result.actions[0].frustrationTypes).toEqual([])
  })

  it('dead click when no activity on non-interactive element', () => {
    const click = makeClick({
      targetSelector: 'div.banner',
      activity: { hadActivity: false },
    })
    const result = computeFrustration([click])

    expect(result.isRage).toBe(false)
    expect(result.actions[0].frustrationTypes).toContain('dead_click')
  })

  it('no dead click on interactive elements', () => {
    const interactiveTags = ['input', 'textarea', 'select', 'label', 'canvas', 'a']
    for (const tag of interactiveTags) {
      const click = makeClick({
        targetSelector: tag,
        activity: { hadActivity: false },
      })
      const result = computeFrustration([click])
      expect(result.actions[0].frustrationTypes).not.toContain('dead_click', `expected no dead_click for <${tag}>`)
    }
  })

  it('error click when errorCount > 0', () => {
    const click = makeClick({ errorCount: 1 })
    const result = computeFrustration([click])

    expect(result.isRage).toBe(false)
    expect(result.actions[0].frustrationTypes).toContain('error_click')
  })

  it('rage click with >= 3 clicks', () => {
    const clicks = [makeClick(), makeClick(), makeClick()]
    const result = computeFrustration(clicks)

    expect(result.isRage).toBe(true)
    expect(result.actions.length).toBe(1)
    expect(result.actions[0].frustrationTypes).toContain('rage_click')
    expect(result.actions[0].click).toBe(clicks[0])
  })

  it('rage disables dead click detection', () => {
    const clicks = Array.from({ length: RAGE_CLICK_THRESHOLD }, () =>
      makeClick({ activity: { hadActivity: false }, targetSelector: 'div.banner' })
    )
    const result = computeFrustration(clicks)

    expect(result.isRage).toBe(true)
    expect(result.actions[0].frustrationTypes).not.toContain('dead_click')
  })

  it('rage + error combination', () => {
    const clicks = [
      makeClick({ errorCount: 1 }),
      makeClick(),
      makeClick(),
    ]
    const result = computeFrustration(clicks)

    expect(result.isRage).toBe(true)
    expect(result.actions[0].frustrationTypes).toContain('rage_click')
    expect(result.actions[0].frustrationTypes).toContain('error_click')
  })

  it('dead + error combination on single click', () => {
    const click = makeClick({
      targetSelector: 'div.banner',
      activity: { hadActivity: false },
      errorCount: 1,
    })
    const result = computeFrustration([click])

    expect(result.isRage).toBe(false)
    const types = result.actions[0].frustrationTypes
    expect(types).toContain('dead_click')
    expect(types).toContain('error_click')
  })
})

describe('isInteractiveElement', () => {
  it('returns true for interactive tags', () => {
    expect(isInteractiveElement('input')).toBe(true)
    expect(isInteractiveElement('input.search')).toBe(true)
    expect(isInteractiveElement('a#link')).toBe(true)
    expect(isInteractiveElement('select')).toBe(true)
  })

  it('returns false for non-interactive tags', () => {
    expect(isInteractiveElement('div')).toBe(false)
    expect(isInteractiveElement('button.submit')).toBe(false)
    expect(isInteractiveElement('span')).toBe(false)
  })
})
