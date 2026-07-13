import { vi, beforeEach, describe, expect, it, type Mock } from 'vitest'
import type { RelativeTime } from '@datadog/js-core/time'
import { clocksNow } from '@datadog/js-core/time'
import { DISCARDED, createHook } from '@datadog/js-core/assembly'
import type { SessionManagerMock } from '@datadog/browser-core/test'
import { createSessionManagerMock } from '@datadog/browser-core/test'
import { mockRumConfiguration, noopRecorderApi } from '../../../test'
import type { AssembleHook, AssembleHookParams, DefaultRumEventAttributes } from '../hooks'
import { SessionType, startSessionContext } from './sessionContext'
import type { ViewHistory } from './viewHistory'

describe('session context', () => {
  let hook: AssembleHook
  let viewHistory: ViewHistory
  let sessionManager: SessionManagerMock
  const fakeView = {
    id: '1',
    startClocks: clocksNow(),
    sessionIsActive: false,
  }
  let isRecordingSpy: Mock
  let getReplayStatsSpy: Mock
  let findViewSpy: Mock
  const fakeStats = {
    segments_count: 4,
    records_count: 10,
    segments_total_raw_size: 1000,
  }

  let configuration: ReturnType<typeof mockRumConfiguration>

  beforeEach(() => {
    viewHistory = { findView: () => undefined } as ViewHistory
    hook = createHook()
    sessionManager = createSessionManagerMock()
    sessionManager.setId('00000000-0000-0000-0000-000000000123')
    const recorderApi = noopRecorderApi

    isRecordingSpy = vi.spyOn(recorderApi, 'isRecording').mockImplementation(() => undefined as never)
    getReplayStatsSpy = vi.spyOn(recorderApi, 'getReplayStats').mockImplementation(() => undefined)
    findViewSpy = vi.spyOn(viewHistory, 'findView').mockReturnValue(fakeView)

    configuration = mockRumConfiguration({ sessionReplaySampleRate: 100 })
    startSessionContext(hook, configuration, sessionManager, recorderApi, viewHistory)
  })

  it('should set id and type', () => {
    isRecordingSpy.mockReturnValue(true)

    const defaultRumEventAttributes = hook.trigger({
      eventType: 'action',
      startTime: 0 as RelativeTime,
    } as AssembleHookParams)

    expect(defaultRumEventAttributes).toEqual({
      type: 'action',
      session: expect.objectContaining({
        id: expect.any(String),
        type: SessionType.USER,
      }),
    })
  })

  it('should set hasReplay when recording has started (isRecording) on events', () => {
    isRecordingSpy.mockReturnValue(true)
    const eventWithHasReplay = hook.trigger({
      eventType: 'action',
      startTime: 0 as RelativeTime,
    } as AssembleHookParams) as DefaultRumEventAttributes

    isRecordingSpy.mockReturnValue(false)
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
    getReplayStatsSpy.mockReturnValue(fakeStats)
    const eventWithHasReplay = hook.trigger({
      eventType: 'view',
      startTime: 0 as RelativeTime,
    } as AssembleHookParams) as DefaultRumEventAttributes

    getReplayStatsSpy.mockReturnValue(undefined)
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
    findViewSpy.mockReturnValue({ ...fakeView, sessionIsActive: true })
    const eventWithActiveSession = hook.trigger({
      eventType: 'view',
      startTime: 0 as RelativeTime,
    } as AssembleHookParams) as DefaultRumEventAttributes
    findViewSpy.mockReturnValue({ ...fakeView, sessionIsActive: false })
    const eventWithoutActiveSession = hook.trigger({
      eventType: 'view',
      startTime: 0 as RelativeTime,
    } as AssembleHookParams) as DefaultRumEventAttributes

    expect(eventWithActiveSession.session!.is_active).toBe(undefined)
    expect(eventWithoutActiveSession.session!.is_active).toBe(false)
  })

  it('should set sampled_for_replay', () => {
    configuration.sessionReplaySampleRate = 100
    const eventSampleForReplay = hook.trigger({
      eventType: 'view',
      startTime: 0 as RelativeTime,
    } as AssembleHookParams) as DefaultRumEventAttributes

    configuration.sessionReplaySampleRate = 0
    const eventSampledOutForReplay = hook.trigger({
      eventType: 'view',
      startTime: 0 as RelativeTime,
    } as AssembleHookParams) as DefaultRumEventAttributes

    expect(eventSampleForReplay.session!.sampled_for_replay).toBe(true)
    expect(eventSampledOutForReplay.session!.sampled_for_replay).toBe(false)
  })

  it('should discard the event if no session', () => {
    sessionManager.setNotTracked()
    const defaultRumEventAttributes = hook.trigger({
      eventType: 'view',
      startTime: 0 as RelativeTime,
    } as AssembleHookParams)

    expect(defaultRumEventAttributes).toBe(DISCARDED)
  })

  it('should discard the event if no view', () => {
    findViewSpy.mockReturnValue(undefined)
    const defaultRumEventAttributes = hook.trigger({
      eventType: 'view',
      startTime: 0 as RelativeTime,
    } as AssembleHookParams)

    expect(defaultRumEventAttributes).toBe(DISCARDED)
  })
})
