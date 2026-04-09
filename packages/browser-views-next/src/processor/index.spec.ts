import { Pipeline } from '@datadog/core-next'
import { viewsProcessor } from './index'

describe('viewsProcessor', () => {
  it('has name "views"', () => {
    expect(viewsProcessor.name).toBe('views')
  })

  it('returns a public API with startView', () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    const api = viewsProcessor.init({ pipeline, config: {} as any, session: {} as any })
    pipeline.seal()
    expect(typeof (api as any).startView).toBe('function')
  })

  it('startView publishes action:start_view to the pipeline', async () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    const actions: Record<string, unknown>[] = []
    pipeline.subscribe('action:start_view', (e) => actions.push(e as Record<string, unknown>))

    const api = viewsProcessor.init({ pipeline, config: {} as any, session: {} as any })
    pipeline.seal()
    ;(api as any).startView('my-view')

    await new Promise((r) => setTimeout(r, 0))

    expect(actions.length).toBe(1)
    expect(actions[0].name).toBe('my-view')
    expect(actions[0].loadingType).toBe('route_change')
    expect(actions[0].url).toBe(window.location.href)
    expect(typeof actions[0].startTime).toBe('number')
    expect(typeof actions[0].startDate).toBe('number')
  })
})
