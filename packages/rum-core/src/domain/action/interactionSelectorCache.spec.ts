import { relativeNow } from '@datadog/browser-core'
import { mockClock } from '@datadog/browser-core/test'
import type { Clock } from '@datadog/browser-core/test'
import {
  updateInteractionSelector,
  getInteractionSelector,
  interactionSelectorCache,
  CLICK_ACTION_MAX_DURATION,
} from './interactionSelectorCache'

describe('interactionSelectorCache', () => {
  let clock: Clock
  beforeEach(() => {
    clock = mockClock()
  })

  it('should delete the selector after getting it', () => {
    const timestamp = relativeNow()
    updateInteractionSelector(timestamp, 'selector')
    expect(getInteractionSelector(timestamp)).toBe('selector')
    expect(interactionSelectorCache.get(timestamp)).toBeUndefined()
  })

  it('should delete outdated selectors', () => {
    const timestamp = relativeNow()
    updateInteractionSelector(timestamp, 'selector')
    expect(getInteractionSelector(timestamp)).toBe('selector')
    clock.tick(CLICK_ACTION_MAX_DURATION)
    expect(interactionSelectorCache.get(timestamp)).toBeUndefined()
  })
})
