import { Pipeline } from '@datadog/core-next'
import { rumProcessor } from './index'
import type { RumPublicApi } from './index'

async function tick() {
  return new Promise((r) => setTimeout(r, 0))
}

function createTestContext() {
  const pipeline = new Pipeline<Record<string, unknown>>()
  const config = {
    rum: {
      trackResources: true,
      trackLongTasks: true,
      trackErrors: true,
    },
  }
  const transport = { route: jasmine.createSpy('route') }
  return { pipeline, config, transport }
}

function initModule(context: {
  pipeline: Pipeline<Record<string, unknown>>
  config: any
  transport: { route: jasmine.Spy }
}): RumPublicApi {
  return rumProcessor.init(context as any) as unknown as RumPublicApi
}

describe('rumProcessor', () => {
  let _api: RumPublicApi | undefined

  afterEach(() => {
    ;(_api as any)?.__stop?.()
    _api = undefined
  })

  function init(context: {
    pipeline: Pipeline<Record<string, unknown>>
    config: any
    transport: { route: jasmine.Spy }
  }): RumPublicApi {
    _api = initModule(context)
    return _api
  }
  it('should have name "rum"', () => {
    expect(rumProcessor.name).toBe('rum')
  })

  it('init returns public API with expected methods', () => {
    const context = createTestContext()
    const api = init(context)

    expect(typeof api.startView).toBe('function')
    expect(typeof api.addError).toBe('function')
    expect(typeof api.getInternalContext).toBe('function')
  })

  it('startView publishes action:start_view to the pipeline', async () => {
    const context = createTestContext()
    const { pipeline } = context
    const actions: Record<string, unknown>[] = []
    pipeline.subscribe('action:start_view', (e) => actions.push(e as Record<string, unknown>))

    const api = init(context)
    pipeline.seal()
    api.startView('checkout')
    await tick()

    expect(actions.length).toBe(1)
    expect(actions[0].name).toBe('checkout')
    expect(actions[0].loadingType).toBe('route_change')
    expect(actions[0].url).toBe(window.location.href)
    expect(typeof actions[0].startTime).toBe('number')
    expect(typeof actions[0].startDate).toBe('number')
  })

  it('addError publishes observation:error', async () => {
    const context = createTestContext()
    const { pipeline } = context
    const observations: unknown[] = []

    pipeline.subscribe('observation:error', (data) => observations.push(data))

    const api = init(context)
    pipeline.seal()

    api.addError('something went wrong')
    await tick()

    expect(observations.length).toBe(1)
    const obs = observations[0] as Record<string, unknown>
    expect(obs.type).toBe('error')
    const error = obs.error as Record<string, unknown>
    expect(error.message).toBe('something went wrong')
    expect(error.source).toBe('custom')
  })

  it('addError accepts an Error object', async () => {
    const context = createTestContext()
    const { pipeline } = context
    const observations: unknown[] = []

    pipeline.subscribe('observation:error', (data) => observations.push(data))

    const api = init(context)
    pipeline.seal()

    api.addError(new TypeError('type mismatch'))
    await tick()

    expect(observations.length).toBe(1)
    const obs = observations[0] as Record<string, unknown>
    const error = obs.error as Record<string, unknown>
    expect(error.message).toBe('type mismatch')
    expect(error.type).toBe('TypeError')
  })

  it('getInternalContext returns an object', () => {
    const context = createTestContext()
    const api = init(context)

    const ctx = api.getInternalContext()

    expect(ctx).toEqual(jasmine.any(Object))
  })

  it('registers routes for all RUM observation types during init', () => {
    const context = createTestContext()
    init(context)

    expect(context.transport.route).toHaveBeenCalledWith('observation:view', 'rum')
    expect(context.transport.route).toHaveBeenCalledWith('observation:resource', 'rum')
    expect(context.transport.route).toHaveBeenCalledWith('observation:error', 'rum')
    expect(context.transport.route).toHaveBeenCalledWith('observation:long_task', 'rum')
  })
})
