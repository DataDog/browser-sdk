import type { RawRumViewEvent } from '../../rawRumEvent.types'
import { RumEventType, ViewLoadingType } from '../../rawRumEvent.types'
import { computeViewDiff, createViewDiffTracker } from './viewDiff'
import type { ServerDuration, TimeStamp } from '@datadog/browser-core'

function createBaseViewEvent(overrides?: Partial<RawRumViewEvent>): RawRumViewEvent {
  return {
    date: 100 as TimeStamp,
    type: RumEventType.VIEW,
    view: {
      loading_type: ViewLoadingType.INITIAL_LOAD,
      time_spent: 1000 as ServerDuration,
      is_active: true,
      error: { count: 0 },
      action: { count: 0 },
      long_task: { count: 0 },
      resource: { count: 0 },
      frustration: { count: 0 },
    },
    _dd: {
      document_version: 1,
      configuration: {
        start_session_replay_recording_manually: false,
      },
    },
    ...overrides,
  } as RawRumViewEvent
}

describe('computeViewDiff', () => {
  it('should return undefined when states are identical', () => {
    const state = createBaseViewEvent()
    expect(computeViewDiff(state, state)).toBeUndefined()
  })

  it('should always include date, type, and _dd.document_version in output', () => {
    const lastSent = createBaseViewEvent()
    const current = createBaseViewEvent({
      _dd: { ...lastSent._dd, document_version: 2 },
      view: { ...lastSent.view, time_spent: 2000 as ServerDuration },
    })
    const diff = computeViewDiff(current, lastSent)!
    expect(diff.type).toBe(RumEventType.VIEW_UPDATE)
    expect(diff.date).toBe(current.date)
    expect(diff._dd.document_version).toBe(2)
  })

  it('should include only changed primitive fields in view', () => {
    const lastSent = createBaseViewEvent()
    const current = createBaseViewEvent({
      view: { ...lastSent.view, time_spent: 2000 as ServerDuration },
    })
    current._dd.document_version = 2
    const diff = computeViewDiff(current, lastSent)!
    expect(diff.view.time_spent as number).toBe(2000)
    expect(diff.view.is_active).toBeUndefined() // unchanged, not in diff
    expect(diff.view.error).toBeUndefined() // unchanged, not in diff
  })

  it('should include changed count objects', () => {
    const lastSent = createBaseViewEvent()
    const current = createBaseViewEvent({
      view: { ...lastSent.view, error: { count: 3 } },
    })
    current._dd.document_version = 2
    const diff = computeViewDiff(current, lastSent)!
    expect(diff.view.error).toEqual({ count: 3 })
    expect(diff.view.action).toBeUndefined() // unchanged
  })

  it('should include only changed sub-fields of nested objects', () => {
    const lastSent = createBaseViewEvent()
    lastSent.view.performance = { cls: { score: 0.1, timestamp: 100 as ServerDuration } }
    const current = createBaseViewEvent()
    current.view.performance = { cls: { score: 0.5, timestamp: 100 as ServerDuration } }
    current._dd.document_version = 2
    const diff = computeViewDiff(current, lastSent)!
    expect(diff.view.performance).toBeDefined()
    expect((diff.view.performance as any).cls.score).toBe(0.5)
  })

  it('should include new optional fields that appear', () => {
    const lastSent = createBaseViewEvent()
    const current = createBaseViewEvent({
      view: { ...lastSent.view, largest_contentful_paint: 500 as ServerDuration },
    })
    current._dd.document_version = 2
    const diff = computeViewDiff(current, lastSent)!
    expect(diff.view.largest_contentful_paint as number).toBe(500)
  })

  it('should send null for optional fields that are removed', () => {
    const lastSent = createBaseViewEvent({
      view: {
        ...createBaseViewEvent().view,
        loading_time: 100 as ServerDuration,
      },
    })
    const current = createBaseViewEvent()
    current._dd.document_version = 2
    // loading_time is NOT in current
    const diff = computeViewDiff(current, lastSent)!
    expect((diff.view as any).loading_time).toBeNull()
  })

  it('should include entire custom_timings when any timing changes (REPLACE)', () => {
    const lastSent = createBaseViewEvent()
    lastSent.view.custom_timings = { foo: 10 as ServerDuration }
    const current = createBaseViewEvent()
    current.view.custom_timings = { foo: 10 as ServerDuration, bar: 20 as ServerDuration }
    current._dd.document_version = 2
    const diff = computeViewDiff(current, lastSent)!
    expect(diff.view.custom_timings).toEqual({ foo: 10 as any, bar: 20 as any })
  })

  it('should include full privacy object when changed (REPLACE)', () => {
    const lastSent = createBaseViewEvent({ privacy: { replay_level: 'mask' as any } })
    const current = createBaseViewEvent({ privacy: { replay_level: 'allow' as any } })
    current._dd.document_version = 2
    const diff = computeViewDiff(current, lastSent)!
    expect(diff.privacy).toEqual({ replay_level: 'allow' })
  })

  it('should include full device object when changed (REPLACE)', () => {
    const lastSent = createBaseViewEvent({ device: { locale: 'en-US' } })
    const current = createBaseViewEvent({ device: { locale: 'fr-FR' } })
    current._dd.document_version = 2
    const diff = computeViewDiff(current, lastSent)!
    expect(diff.device).toEqual({ locale: 'fr-FR' })
  })

  it('should include only new trailing elements for _dd.page_states (APPEND)', () => {
    const lastSent = createBaseViewEvent()
    lastSent._dd.page_states = [{ state: 'active' as any, start: 0 as any }]
    const current = createBaseViewEvent()
    current._dd.page_states = [
      { state: 'active' as any, start: 0 as any },
      { state: 'hidden' as any, start: 100 as any },
    ]
    current._dd.document_version = 2
    const diff = computeViewDiff(current, lastSent)!
    expect(diff._dd.page_states).toEqual([{ state: 'hidden' as any, start: 100 as any }])
  })

  it('should not include _dd.page_states when array has not grown', () => {
    const lastSent = createBaseViewEvent()
    lastSent._dd.page_states = [{ state: 'active' as any, start: 0 as any }]
    const current = createBaseViewEvent()
    current._dd.page_states = [{ state: 'active' as any, start: 0 as any }]
    current._dd.document_version = 2
    current.view.time_spent = 2000 as ServerDuration // trigger some change
    const diff = computeViewDiff(current, lastSent)!
    expect(diff._dd.page_states).toBeUndefined()
  })

  it('should handle multiple field types changing simultaneously', () => {
    const lastSent = createBaseViewEvent()
    const current = createBaseViewEvent({
      view: { ...lastSent.view, time_spent: 5000 as ServerDuration, error: { count: 2 } },
    })
    current._dd = {
      ...lastSent._dd,
      document_version: 3,
      replay_stats: { records_count: 10, segments_count: 1, segments_total_raw_size: 500 },
    }
    const diff = computeViewDiff(current, lastSent)!
    expect(diff.view.time_spent as number).toBe(5000)
    expect(diff.view.error).toEqual({ count: 2 })
    expect(diff._dd.replay_stats).toBeDefined()
    expect(diff._dd.document_version).toBe(3)
  })

  it('should not include _dd.configuration when unchanged', () => {
    const lastSent = createBaseViewEvent()
    const current = createBaseViewEvent({ view: { ...lastSent.view, time_spent: 2000 as ServerDuration } })
    current._dd.document_version = 2
    const diff = computeViewDiff(current, lastSent)!
    expect(diff._dd.configuration).toBeUndefined()
  })

  it('should include only changed display.scroll fields (MERGE)', () => {
    const lastSent = createBaseViewEvent({
      display: { scroll: { max_depth: 100 } },
    })
    const current = createBaseViewEvent({
      display: { scroll: { max_depth: 200 } },
    })
    current._dd.document_version = 2
    const diff = computeViewDiff(current, lastSent)!
    expect(diff.display).toBeDefined()
    expect((diff.display as any).scroll.max_depth).toBe(200)
  })

  it('should include is_active change when view ends', () => {
    const lastSent = createBaseViewEvent()
    const current = createBaseViewEvent({
      view: { ...lastSent.view, is_active: false, time_spent: 5000 as ServerDuration },
    })
    current._dd.document_version = 5
    const diff = computeViewDiff(current, lastSent)!
    expect(diff.view.is_active).toBe(false)
    expect(diff.view.time_spent as number).toBe(5000)
  })
})

describe('createViewDiffTracker', () => {
  it('should store and return the last sent state', () => {
    const tracker = createViewDiffTracker()
    const state = createBaseViewEvent()
    tracker.recordSentState(state)
    expect(tracker.getLastSentState()).toEqual(state)
  })

  it('should return undefined when no state has been recorded', () => {
    const tracker = createViewDiffTracker()
    expect(tracker.getLastSentState()).toBeUndefined()
  })

  it('should return undefined after reset', () => {
    const tracker = createViewDiffTracker()
    tracker.recordSentState(createBaseViewEvent())
    tracker.reset()
    expect(tracker.getLastSentState()).toBeUndefined()
  })

  it('should deep clone the state so original mutations do not affect stored state', () => {
    const tracker = createViewDiffTracker()
    const state = createBaseViewEvent()
    tracker.recordSentState(state)
    state.view.error.count = 999
    expect(tracker.getLastSentState()!.view.error.count).toBe(0)
  })

  it('should overwrite previously stored state', () => {
    const tracker = createViewDiffTracker()
    const state1 = createBaseViewEvent()
    const state2 = createBaseViewEvent({ _dd: { ...state1._dd, document_version: 2 } })
    tracker.recordSentState(state1)
    tracker.recordSentState(state2)
    expect(tracker.getLastSentState()!._dd.document_version).toBe(2)
  })
})
