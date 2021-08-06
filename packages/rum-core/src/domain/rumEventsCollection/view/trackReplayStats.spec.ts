import { ViewReplayStats } from '@datadog/browser-rum-core'
import { LifeCycle, LifeCycleEventType } from '../../lifeCycle'
import { trackReplayStats } from './trackReplayStats'

describe('trackReplayStats', () => {
  let lifeCycle: LifeCycle
  let callbackSpy: jasmine.Spy<(data: ViewReplayStats) => void>

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    callbackSpy = jasmine.createSpy<(data: ViewReplayStats) => void>()
    trackReplayStats(lifeCycle, 'a', callbackSpy)
  })

  it('sets the replay stats when an update is notified', () => {
    lifeCycle.notify(LifeCycleEventType.REPLAY_STATS_UPDATED, { viewId: 'a', segmentsCount: 1, recordsCount: 1 })
    expect(callbackSpy).toHaveBeenCalledOnceWith({
      segments_count: 1,
      records_count: 1,
      segments_total_raw_size: 0,
    })
  })

  it('accumulates the replay stats when multiple updates are notified', () => {
    lifeCycle.notify(LifeCycleEventType.REPLAY_STATS_UPDATED, { viewId: 'a', segmentsCount: 1, recordsCount: 1 })
    lifeCycle.notify(LifeCycleEventType.REPLAY_STATS_UPDATED, { viewId: 'a', recordsCount: 1 })
    lifeCycle.notify(LifeCycleEventType.REPLAY_STATS_UPDATED, { viewId: 'a', rawSize: 10 })
    expect(callbackSpy.calls.mostRecent().args[0]).toEqual({
      segments_count: 1,
      records_count: 2,
      segments_total_raw_size: 10,
    })
  })

  it('discards updates when they are about another view', () => {
    lifeCycle.notify(LifeCycleEventType.REPLAY_STATS_UPDATED, { viewId: 'b', segmentsCount: 1, recordsCount: 1 })
    expect(callbackSpy).not.toHaveBeenCalled()
  })
})
