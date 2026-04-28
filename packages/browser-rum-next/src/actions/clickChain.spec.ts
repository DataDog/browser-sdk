import { createClickChain, MAX_CLICK_GAP, MAX_CLICK_DISTANCE } from './clickChain'
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

describe('createClickChain', () => {
  beforeEach(() => jasmine.clock().install())
  afterEach(() => jasmine.clock().uninstall())

  it('groups clicks on same target within time and distance', () => {
    let finalized: PendingClick[] | undefined
    const first = makeClick({ startTime: 0 })
    const chain = createClickChain(first, (clicks) => {
      finalized = clicks
    })

    const second = makeClick({ startTime: 500 })
    expect(chain.tryAppend(second)).toBe(true)

    jasmine.clock().tick(MAX_CLICK_GAP)

    expect(finalized).toBeDefined()
    expect(finalized!.length).toBe(2)
    chain.stop()
  })

  it('rejects click on different target', () => {
    const first = makeClick({ targetSelector: 'button.submit' })
    const chain = createClickChain(first, () => {})

    const other = makeClick({ targetSelector: 'button.cancel' })
    expect(chain.tryAppend(other)).toBe(false)

    chain.stop()
  })

  it('rejects click after time gap', () => {
    const first = makeClick({ startTime: 0 })
    const chain = createClickChain(first, () => {})

    const late = makeClick({ startTime: MAX_CLICK_GAP + 1 })
    expect(chain.tryAppend(late)).toBe(false)

    chain.stop()
  })

  it('rejects click beyond distance threshold', () => {
    const first = makeClick({ positionX: 0, positionY: 0 })
    const chain = createClickChain(first, () => {})

    const far = makeClick({ positionX: MAX_CLICK_DISTANCE + 1, positionY: 0 })
    expect(chain.tryAppend(far)).toBe(false)

    chain.stop()
  })

  it('finalizes after timeout', () => {
    let finalized: PendingClick[] | undefined
    const first = makeClick()
    createClickChain(first, (clicks) => {
      finalized = clicks
    })

    jasmine.clock().tick(MAX_CLICK_GAP)

    expect(finalized).toBeDefined()
    expect(finalized!.length).toBe(1)
    expect(finalized![0]).toBe(first)
  })

  it('resets timeout when click is appended', () => {
    let finalized: PendingClick[] | undefined
    const first = makeClick({ startTime: 0 })
    const chain = createClickChain(first, (clicks) => {
      finalized = clicks
    })

    // Advance almost to timeout
    jasmine.clock().tick(MAX_CLICK_GAP - 1)
    expect(finalized).toBeUndefined()

    // Append a click — timer should reset
    const second = makeClick({ startTime: MAX_CLICK_GAP - 1 })
    chain.tryAppend(second)

    // Advance another full gap
    jasmine.clock().tick(MAX_CLICK_GAP)

    expect(finalized).toBeDefined()
    expect(finalized!.length).toBe(2)
  })

  it('stop cancels the timer', () => {
    let finalized: PendingClick[] | undefined
    const first = makeClick()
    const chain = createClickChain(first, (clicks) => {
      finalized = clicks
    })

    chain.stop()
    jasmine.clock().tick(MAX_CLICK_GAP)

    expect(finalized).toBeUndefined()
  })
})

export { makeClick }
