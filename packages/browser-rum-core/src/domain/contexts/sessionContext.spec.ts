import type { RelativeTime } from '@datadog/js-core/time'
import { clocksNow } from '@datadog/js-core/time'
import { DISCARDED, createHook } from '@datadog/js-core/assembly'
import { createSessionManagerMock } from '@datadog/browser-core/test'
import { mockRumConfiguration, noopRecorderApi } from '../../../test'
import type { AssembleHookParams, DefaultRumEventAttributes } from '../hooks'
import { SessionType, startSessionContext } from './sessionContext'
import type { ViewHistory } from './viewHistory'

describe('session context', () => {
  const fakeView = {
    id: '1',
    startClocks: clocksNow(),
    sessionIsActive: false,
  }
  const fakeStats = {
    segments_count: 4,
    records_count: 10,
    segments_total_raw_size: 1000,
  }

  function setup(configOverride: Parameters<typeof mockRumConfiguration>[0] = {}) {
    const hook = createHook<AssembleHookParams, DefaultRumEventAttributes>()
    const viewHistory = { findView: () => undefined } as ViewHistory
    const sessionManager = createSessionManagerMock()
    sessionManager.setId('00000000-0000-0000-0000-000000000123')
    const recorderApi = { ...noopRecorderApi }

    const isRecordingSpy = spyOn(recorderApi, 'isRecording')
    const getReplayStatsSpy = spyOn(recorderApi, 'getReplayStats')
    const findViewSpy = spyOn(viewHistory, 'findView').and.returnValue(fakeView)

    const configuration = mockRumConfiguration({ sessionReplaySampleRate: 100, ...configOverride })
    startSessionContext(hook, configuration, sessionManager, recorderApi, viewHistory)

    return { hook, isRecordingSpy, getReplayStatsSpy, findViewSpy, sessionManager }
  }

  it('should set id and type', () => {
    const { hook, isRecordingSpy } = setup()
    isRecordingSpy.and.returnValue(true)

    const defaultRumEventAttributes = hook.trigger({
      eventType: 'action',
      startTime: 0 as RelativeTime,
    } as AssembleHookParams)

    expect(defaultRumEventAttributes).toEqual({
      type: 'action',
      session: jasmine.objectContaining({
        id: jasmine.any(String),
        type: SessionType.USER,
      }),
    })
  })

  it('should set hasReplay when recording has started (isRecording) on events', () => {
    const { hook, isRecordingSpy, getReplayStatsSpy } = setup()

    isRecordingSpy.and.returnValue(true)
    const eventWithHasReplay = hook.trigger({
      eventType: 'action',
      startTime: 0 as RelativeTime,
    } as AssembleHookParams) as DefaultRumEventAttributes

    isRecordingSpy.and.returnValue(false)
    const eventWithoutHasReplay = hook.trigger({
      eventType: 'action',
      startTime: 0 as RelativeTime,
    } as AssembleHookParams) as DefaultRumEventAttributes

    expect(getReplayStatsSpy).not.toHaveBeenCalled()
    expect(isRecordingSpy).toHaveBeenCalled()
    expect(eventWithHasReplay.session!.has_replay).toEqual(true)
    expect(eventWithoutHasReplay.session!.has_replay).toBeUndefined()
  })

  it('should set hasReplay when there are Replay stats on view events', () => {
    const { hook, getReplayStatsSpy, isRecordingSpy } = setup()

    getReplayStatsSpy.and.returnValue(fakeStats)
    const eventWithHasReplay = hook.trigger({
      eventType: 'view',
      startTime: 0 as RelativeTime,
    } as AssembleHookParams) as DefaultRumEventAttributes

    getReplayStatsSpy.and.returnValue(undefined)
    const eventWithoutHasReplay = hook.trigger({
      eventType: 'view',
      startTime: 0 as RelativeTime,
    } as AssembleHookParams) as DefaultRumEventAttributes

    expect(getReplayStatsSpy).toHaveBeenCalled()
    expect(isRecordingSpy).not.toHaveBeenCalled()
    expect(eventWithHasReplay.session!.has_replay).toEqual(true)
    expect(eventWithoutHasReplay.session!.has_replay).toBeUndefined()
  })

  it('should set session.is_active when the session is active', () => {
    const { hook, findViewSpy } = setup()

    findViewSpy.and.returnValue({ ...fakeView, sessionIsActive: true })
    const eventWithActiveSession = hook.trigger({
      eventType: 'view',
      startTime: 0 as RelativeTime,
    } as AssembleHookParams) as DefaultRumEventAttributes

    findViewSpy.and.returnValue({ ...fakeView, sessionIsActive: false })
    const eventWithoutActiveSession = hook.trigger({
      eventType: 'view',
      startTime: 0 as RelativeTime,
    } as AssembleHookParams) as DefaultRumEventAttributes

    expect(eventWithActiveSession.session!.is_active).toBe(undefined)
    expect(eventWithoutActiveSession.session!.is_active).toBe(false)
  })

  it('should set sampled_for_replay', () => {
    const { hook: hookSampled } = setup({ sessionReplaySampleRate: 100 })
    const eventSampleForReplay = hookSampled.trigger({
      eventType: 'view',
      startTime: 0 as RelativeTime,
    } as AssembleHookParams) as DefaultRumEventAttributes

    const { hook: hookNotSampled } = setup({ sessionReplaySampleRate: 0 })
    const eventSampledOutForReplay = hookNotSampled.trigger({
      eventType: 'view',
      startTime: 0 as RelativeTime,
    } as AssembleHookParams) as DefaultRumEventAttributes

    expect(eventSampleForReplay.session!.sampled_for_replay).toBe(true)
    expect(eventSampledOutForReplay.session!.sampled_for_replay).toBe(false)
  })

  it('should discard the event if no session', () => {
    const { hook, sessionManager } = setup()
    sessionManager.setNotTracked()
    const defaultRumEventAttributes = hook.trigger({
      eventType: 'view',
      startTime: 0 as RelativeTime,
    } as AssembleHookParams)

    expect(defaultRumEventAttributes).toBe(DISCARDED)
  })

  it('should discard the event if no view', () => {
    const { hook, findViewSpy } = setup()
    findViewSpy.and.returnValue(undefined)
    const defaultRumEventAttributes = hook.trigger({
      eventType: 'view',
      startTime: 0 as RelativeTime,
    } as AssembleHookParams)

    expect(defaultRumEventAttributes).toBe(DISCARDED)
  })
})
