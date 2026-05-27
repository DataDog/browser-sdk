import { ExperimentalFeature, addExperimentalFeatures } from '@datadog/browser-core'
import { resetExperimentalFeatures } from '@datadog/browser-core/src/tools/experimentalFeatures'
import { registerCleanupTask } from '@datadog/browser-core/test'
import type { RumViewEvent } from '../rumEvent.types'
import { RumEventType } from '../rawRumEvent.types'
import { assembleViewUpdateEvent, PARTIAL_VIEW_UPDATE_CHECKPOINT_INTERVAL } from './startRumBatch'

function makeViewEvent(overrides: Record<string, unknown> = {}): RumViewEvent {
  return {
    type: RumEventType.VIEW,
    date: 1000,
    application: { id: 'app-1' },
    session: { id: 'sess-1', type: 'user' },
    view: {
      id: 'view-1',
      name: 'Home',
      url: '/home',
      referrer: '',
      is_active: true,
      action: { count: 0 },
      error: { count: 0 },
      long_task: { count: 0 },
      resource: { count: 0 },
      time_spent: 0,
    },
    _dd: {
      document_version: 1,
      format_version: 2,
      sdk_name: 'rum',
      configuration: { start_session_replay_recording_manually: false },
    },
    service: 'my-service',
    version: '1.0.0',
    ddtags: 'env:prod',
    source: 'browser',
    context: {},
    ...overrides,
  } as unknown as RumViewEvent
}

describe('assembleViewUpdateEvent', () => {
  it('should return undefined when nothing has changed', () => {
    const last = makeViewEvent()
    const current = makeViewEvent({
      _dd: {
        document_version: 2,
        format_version: 2,
        sdk_name: 'rum',
        configuration: { start_session_replay_recording_manually: false },
      },
    })
    const result = assembleViewUpdateEvent(current, last)

    // Only document_version changed (always required, not a "meaningful change")
    // view.* unchanged → should return undefined
    expect(result).toBeUndefined()
  })

  it('should always include required routing fields', () => {
    const last = makeViewEvent()
    const current = makeViewEvent({
      _dd: {
        document_version: 2,
        format_version: 2,
        sdk_name: 'rum',
        configuration: { start_session_replay_recording_manually: false },
      },
      view: {
        id: 'view-1',
        name: 'Home',
        url: '/home',
        referrer: '',
        is_active: true,
        action: { count: 1 },
        error: { count: 0 },
        long_task: { count: 0 },
        resource: { count: 0 },
        time_spent: 100,
      },
    })
    const result = assembleViewUpdateEvent(current, last)!

    expect(result.type).toBe('view_update')
    expect((result as any).application).toEqual({ id: 'app-1' })
    expect((result as any).session).toEqual({ id: 'sess-1', type: 'user' })
    expect((result.view as any).id).toBe('view-1')
    expect((result.view as any).url).toBe('/home')
    expect((result._dd as any).document_version).toBe(2)
    expect((result._dd as any).format_version).toBe(2)
  })

  it('should include only changed view.* fields', () => {
    const last = makeViewEvent()
    const current = makeViewEvent({
      _dd: {
        document_version: 2,
        format_version: 2,
        sdk_name: 'rum',
        configuration: { start_session_replay_recording_manually: false },
      },
      view: {
        id: 'view-1',
        name: 'Home',
        url: '/home',
        referrer: '',
        is_active: true,
        action: { count: 3 },
        error: { count: 0 },
        long_task: { count: 0 },
        resource: { count: 0 },
        time_spent: 5000,
      },
    })
    const result = assembleViewUpdateEvent(current, last)!

    expect((result.view as any).action).toEqual({ count: 3 }) // changed
    expect((result.view as any).time_spent).toBe(5000) // changed
    expect((result.view as any).error).toBeUndefined() // unchanged, stripped
    expect((result.view as any).name).toBeUndefined() // unchanged, stripped
    expect((result.view as any).url).toBe('/home') // required routing field, always present
  })

  it('should strip unchanged top-level assembled fields', () => {
    const last = makeViewEvent({ service: 'svc', version: '1.0.0' })
    const current = makeViewEvent({
      _dd: {
        document_version: 2,
        format_version: 2,
        sdk_name: 'rum',
        configuration: { start_session_replay_recording_manually: false },
      },
      view: {
        id: 'view-1',
        name: 'Home',
        url: '/home',
        referrer: '',
        is_active: true,
        action: { count: 1 },
        error: { count: 0 },
        long_task: { count: 0 },
        resource: { count: 0 },
        time_spent: 100,
      },
      service: 'svc',
      version: '1.0.0',
    })
    const result = assembleViewUpdateEvent(current, last)!

    expect(result.service).toBeUndefined() // unchanged, stripped
    expect((result as any).version).toBeUndefined() // unchanged, stripped
  })

  it('should keep top-level assembled fields that changed', () => {
    const last = makeViewEvent({ service: 'old-service' })
    const current = makeViewEvent({
      _dd: {
        document_version: 2,
        format_version: 2,
        sdk_name: 'rum',
        configuration: { start_session_replay_recording_manually: false },
      },
      view: {
        id: 'view-1',
        name: 'Home',
        url: '/home',
        referrer: '',
        is_active: true,
        action: { count: 1 },
        error: { count: 0 },
        long_task: { count: 0 },
        resource: { count: 0 },
        time_spent: 100,
      },
      service: 'new-service',
    })
    const result = assembleViewUpdateEvent(current, last)!

    expect(result.service).toBe('new-service')
  })

  it('should not mutate the input events', () => {
    const last = makeViewEvent()
    const current = makeViewEvent({
      _dd: {
        document_version: 2,
        format_version: 2,
        sdk_name: 'rum',
        configuration: { start_session_replay_recording_manually: false },
      },
      view: {
        id: 'view-1',
        name: 'Home',
        url: '/home',
        referrer: '',
        is_active: true,
        action: { count: 1 },
        error: { count: 0 },
        long_task: { count: 0 },
        resource: { count: 0 },
        time_spent: 100,
      },
    })
    const currentService = current.service
    assembleViewUpdateEvent(current, last)

    expect(current.service).toBe(currentService)
  })
})

describe('startRumBatch partial_view_updates routing', () => {
  beforeEach(() => {
    addExperimentalFeatures([ExperimentalFeature.PARTIAL_VIEW_UPDATES])
    registerCleanupTask(resetExperimentalFeatures)
  })

  it('PARTIAL_VIEW_UPDATE_CHECKPOINT_INTERVAL should be 100', () => {
    expect(PARTIAL_VIEW_UPDATE_CHECKPOINT_INTERVAL).toBe(100)
  })
})
