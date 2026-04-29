import { Pipeline } from '@datadog/core-next'
import { startVitalProcessor } from './vitals'

async function tick() {
  return new Promise((r) => setTimeout(r, 0))
}

describe('startVitalProcessor', () => {
  let pipeline: Pipeline<Record<string, unknown>>
  let observations: unknown[]

  beforeEach(() => {
    pipeline = new Pipeline<Record<string, unknown>>()
    observations = []
    pipeline.subscribe('observation:vital', (data) => observations.push(data))
    startVitalProcessor(pipeline)
    pipeline.seal()
  })

  it('publishes observation:vital when start_vital + stop_vital are called', async () => {
    pipeline.publish('action:start_vital', { name: 'checkout' })
    pipeline.publish('action:stop_vital', { name: 'checkout' })
    await tick()

    expect(observations.length).toBe(1)
    const obs = observations[0] as Record<string, unknown>
    expect(obs.type).toBe('vital')
    const vital = obs.vital as Record<string, unknown>
    expect(vital.name).toBe('checkout')
    expect(vital.type).toBe('duration')
    expect(typeof vital.value).toBe('number')
    expect((vital.value as number)).toBeGreaterThanOrEqual(0)
    expect(vital.id).toBeDefined()
  })

  it('does not publish if stop_vital is called without matching start_vital', async () => {
    pipeline.publish('action:stop_vital', { name: 'nonexistent' })
    await tick()

    expect(observations.length).toBe(0)
  })

  it('uses vitalKey as the tracking key when provided', async () => {
    pipeline.publish('action:start_vital', { name: 'checkout', vitalKey: 'my-key' })
    pipeline.publish('action:stop_vital', { vitalKey: 'my-key' })
    await tick()

    expect(observations.length).toBe(1)
    const vital = (observations[0] as Record<string, unknown>).vital as Record<string, unknown>
    expect(vital.name).toBe('my-key')
  })

  it('includes context from start when stop has no context', async () => {
    pipeline.publish('action:start_vital', { name: 'checkout', context: { page: 'cart' } })
    pipeline.publish('action:stop_vital', { name: 'checkout' })
    await tick()

    const obs = observations[0] as Record<string, unknown>
    expect(obs.context).toEqual({ page: 'cart' })
  })

  it('merges context from start and stop', async () => {
    pipeline.publish('action:start_vital', { name: 'checkout', context: { page: 'cart' } })
    pipeline.publish('action:stop_vital', { name: 'checkout', context: { result: 'ok' } })
    await tick()

    const obs = observations[0] as Record<string, unknown>
    expect(obs.context).toEqual({ page: 'cart', result: 'ok' })
  })

  it('stop context overrides start context for same keys', async () => {
    pipeline.publish('action:start_vital', { name: 'checkout', context: { value: 'start' } })
    pipeline.publish('action:stop_vital', { name: 'checkout', context: { value: 'stop' } })
    await tick()

    const obs = observations[0] as Record<string, unknown>
    expect((obs.context as any).value).toBe('stop')
  })

  it('publishes observation:vital immediately for add_vital', async () => {
    pipeline.publish('action:add_vital', { name: 'lcp', value: 1200 })
    await tick()

    expect(observations.length).toBe(1)
    const obs = observations[0] as Record<string, unknown>
    expect(obs.type).toBe('vital')
    const vital = obs.vital as Record<string, unknown>
    expect(vital.name).toBe('lcp')
    expect(vital.value).toBe(1200)
    expect(vital.type).toBe('duration')
  })

  it('includes context in add_vital observation', async () => {
    pipeline.publish('action:add_vital', { name: 'lcp', value: 800, context: { section: 'hero' } })
    await tick()

    const obs = observations[0] as Record<string, unknown>
    expect(obs.context).toEqual({ section: 'hero' })
  })

  it('cleans up tracked vital after stop so second stop is a no-op', async () => {
    pipeline.publish('action:start_vital', { name: 'checkout' })
    pipeline.publish('action:stop_vital', { name: 'checkout' })
    pipeline.publish('action:stop_vital', { name: 'checkout' })
    await tick()

    expect(observations.length).toBe(1)
  })

  it('handles multiple concurrent vitals independently', async () => {
    pipeline.publish('action:start_vital', { name: 'a' })
    pipeline.publish('action:start_vital', { name: 'b' })
    pipeline.publish('action:stop_vital', { name: 'a' })
    pipeline.publish('action:stop_vital', { name: 'b' })
    await tick()

    expect(observations.length).toBe(2)
    const names = observations.map((o) => ((o as Record<string, unknown>).vital as Record<string, unknown>).name)
    expect(names).toContain('a')
    expect(names).toContain('b')
  })
})
