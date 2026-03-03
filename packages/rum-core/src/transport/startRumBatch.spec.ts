import type { AssembledRumEvent } from '../rawRumEvent.types'
import { RumEventType } from '../rawRumEvent.types'
import { stripViewUpdateFields } from './startRumBatch'

function makeAssembledView(overrides: Record<string, unknown> = {}): AssembledRumEvent {
  return {
    type: RumEventType.VIEW,
    date: 1000,
    application: { id: 'app-1' },
    session: { id: 'sess-1', type: 'user' },
    view: { id: 'view-1', name: 'Home', url: '/home', referrer: '' },
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
  } as unknown as AssembledRumEvent
}

function makeAssembledViewUpdate(overrides: Record<string, unknown> = {}): AssembledRumEvent {
  return {
    ...makeAssembledView(),
    type: RumEventType.VIEW_UPDATE,
    ...overrides,
  } as unknown as AssembledRumEvent
}

describe('stripViewUpdateFields', () => {
  it('should never strip required routing fields', () => {
    const lastView = makeAssembledView()
    const viewUpdate = makeAssembledViewUpdate()
    const stripped = stripViewUpdateFields(viewUpdate, lastView)

    expect(stripped.type).toBe(RumEventType.VIEW_UPDATE)
    expect(stripped.date).toBeDefined()
    expect(stripped.application).toEqual({ id: 'app-1' })
    expect(stripped.session).toEqual({ id: 'sess-1', type: 'user' })
    expect((stripped.view as any).id).toBe('view-1')
    expect((stripped._dd as any).document_version).toBe(1)
  })

  it('should strip top-level fields unchanged from last VIEW', () => {
    const lastView = makeAssembledView({ service: 'my-service', ddtags: 'env:prod', source: 'browser' })
    const viewUpdate = makeAssembledViewUpdate({ service: 'my-service', ddtags: 'env:prod', source: 'browser' })
    const stripped = stripViewUpdateFields(viewUpdate, lastView)

    expect(stripped.service).toBeUndefined()
    expect((stripped as any).ddtags).toBeUndefined()
    expect((stripped as any).source).toBeUndefined()
  })

  it('should keep top-level fields that differ from last VIEW', () => {
    const lastView = makeAssembledView({ service: 'old-service' })
    const viewUpdate = makeAssembledViewUpdate({ service: 'new-service' })
    const stripped = stripViewUpdateFields(viewUpdate, lastView)

    expect(stripped.service).toBe('new-service')
  })

  it('should strip view.* sub-fields that are unchanged (except view.id)', () => {
    const lastView = makeAssembledView({ view: { id: 'view-1', name: 'Home', url: '/home', referrer: '' } })
    const viewUpdate = makeAssembledViewUpdate({
      view: { id: 'view-1', name: 'Home', url: '/home', referrer: '', error: { count: 3 } },
    })
    const stripped = stripViewUpdateFields(viewUpdate, lastView)

    expect((stripped.view as any).id).toBe('view-1') // always kept
    expect((stripped.view as any).name).toBeUndefined() // unchanged, stripped
    expect((stripped.view as any).url).toBeUndefined() // unchanged, stripped
    expect((stripped.view as any).error).toEqual({ count: 3 }) // changed, kept
  })

  it('should strip _dd.* sub-fields that are unchanged (except _dd.document_version)', () => {
    const lastView = makeAssembledView({ _dd: { document_version: 1, format_version: 2, sdk_name: 'rum' } })
    const viewUpdate = makeAssembledViewUpdate({ _dd: { document_version: 2, format_version: 2, sdk_name: 'rum' } })
    const stripped = stripViewUpdateFields(viewUpdate, lastView)

    expect((stripped._dd as any).document_version).toBe(2) // always kept
    expect((stripped._dd as any).format_version).toBeUndefined() // unchanged, stripped
    expect((stripped._dd as any).sdk_name).toBeUndefined() // unchanged, stripped
  })

  it('should strip display.* sub-fields that are unchanged', () => {
    const viewport = { width: 1920, height: 1080 }
    const lastView = makeAssembledView({ display: { viewport, scroll: { max_depth: 100 } } })
    const viewUpdate = makeAssembledViewUpdate({ display: { viewport, scroll: { max_depth: 200 } } })
    const stripped = stripViewUpdateFields(viewUpdate, lastView)

    expect((stripped as any).display.viewport).toBeUndefined() // unchanged, stripped
    expect((stripped as any).display.scroll).toEqual({ max_depth: 200 }) // changed, kept
  })

  it('should remove display entirely if all sub-fields are stripped', () => {
    const viewport = { width: 1920, height: 1080 }
    const lastView = makeAssembledView({ display: { viewport } })
    const viewUpdate = makeAssembledViewUpdate({ display: { viewport } })
    const stripped = stripViewUpdateFields(viewUpdate, lastView)

    expect((stripped as any).display).toBeUndefined()
  })

  it('should not mutate the original viewUpdate object', () => {
    const lastView = makeAssembledView()
    const viewUpdate = makeAssembledViewUpdate()
    const originalService = viewUpdate.service
    stripViewUpdateFields(viewUpdate, lastView)

    expect(viewUpdate.service).toBe(originalService)
  })
})
