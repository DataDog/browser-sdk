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
  return { pipeline, config }
}

function initModule(context: { pipeline: Pipeline<Record<string, unknown>>; config: any }): RumPublicApi {
  return rumProcessor.init(context as any) as unknown as RumPublicApi
}

describe('rumProcessor', () => {
  it('should have name "rum"', () => {
    expect(rumProcessor.name).toBe('rum')
  })

  it('init returns public API with expected methods', () => {
    const { pipeline, config } = createTestContext()
    const api = initModule({ pipeline, config })

    expect(typeof api.addError).toBe('function')
    expect(typeof api.getInternalContext).toBe('function')
    expect(typeof api.setGlobalContext).toBe('function')
    expect(typeof api.getGlobalContext).toBe('function')
    expect(typeof api.setUser).toBe('function')
    expect(typeof api.getUser).toBe('function')
    expect(typeof api.setAccount).toBe('function')
    expect(typeof api.getAccount).toBe('function')
  })

  it('addError publishes observation:rum_error', async () => {
    const { pipeline, config } = createTestContext()
    const observations: unknown[] = []

    pipeline.subscribe('observation:rum_error', (data) => observations.push(data))

    const api = initModule({ pipeline, config })
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
    const { pipeline, config } = createTestContext()
    const observations: unknown[] = []

    pipeline.subscribe('observation:rum_error', (data) => observations.push(data))

    const api = initModule({ pipeline, config })
    pipeline.seal()

    api.addError(new TypeError('type mismatch'))
    await tick()

    expect(observations.length).toBe(1)
    const obs = observations[0] as Record<string, unknown>
    const error = obs.error as Record<string, unknown>
    expect(error.message).toBe('type mismatch')
    expect(error.type).toBe('TypeError')
  })

  it('getInternalContext returns global and user context', () => {
    const { pipeline, config } = createTestContext()
    const api = initModule({ pipeline, config })

    api.setGlobalContext({ env: 'test' })
    api.setUser({ id: 'user-1' })

    const ctx = api.getInternalContext()

    expect(ctx.env).toBe('test')
    expect(ctx.usr).toEqual({ id: 'user-1' })
  })

  it('setGlobalContext / getGlobalContext round-trips', () => {
    const { pipeline, config } = createTestContext()
    const api = initModule({ pipeline, config })

    api.setGlobalContext({ version: '2.0.0' })

    expect(api.getGlobalContext()).toEqual({ version: '2.0.0' })
  })

  it('setUser / getUser round-trips', () => {
    const { pipeline, config } = createTestContext()
    const api = initModule({ pipeline, config })

    api.setUser({ id: 'u-42', name: 'Alice' })

    expect(api.getUser()).toEqual({ id: 'u-42', name: 'Alice' })
  })

  it('clearUser empties the user context', () => {
    const { pipeline, config } = createTestContext()
    const api = initModule({ pipeline, config })

    api.setUser({ id: 'u-42' })
    api.clearUser()

    expect(api.getUser()).toEqual({})
  })

  it('setAccount / getAccount round-trips', () => {
    const { pipeline, config } = createTestContext()
    const api = initModule({ pipeline, config })

    api.setAccount({ id: 'acct-1', name: 'Acme' })

    expect(api.getAccount()).toEqual({ id: 'acct-1', name: 'Acme' })
  })
})
