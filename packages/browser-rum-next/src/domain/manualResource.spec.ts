import { Pipeline } from '@datadog/core-next'
import { startManualResourceProcessor } from './manualResource'

async function tick() {
  return new Promise((r) => setTimeout(r, 0))
}

describe('startManualResourceProcessor', () => {
  let pipeline: Pipeline<Record<string, unknown>>
  let observations: unknown[]

  beforeEach(() => {
    pipeline = new Pipeline<Record<string, unknown>>()
    observations = []
    pipeline.subscribe('observation:resource', (data) => observations.push(data))
    startManualResourceProcessor(pipeline)
    pipeline.seal()
  })

  it('publishes observation:resource when start_resource + stop_resource are called', async () => {
    pipeline.publish('action:start_resource', { name: 'load-image' })
    pipeline.publish('action:stop_resource', { name: 'load-image' })
    await tick()

    expect(observations.length).toBe(1)
    const obs = observations[0] as Record<string, unknown>
    expect(obs.type).toBe('resource')
    const resource = obs.resource as Record<string, unknown>
    expect(resource.name).toBe('load-image')
    expect(resource.type).toBe('custom')
    expect(typeof resource.duration).toBe('number')
    expect((resource.duration as number)).toBeGreaterThanOrEqual(0)
    expect(resource.id).toBeDefined()
  })

  it('does not publish if stop_resource is called without matching start_resource', async () => {
    pipeline.publish('action:stop_resource', { name: 'nonexistent' })
    await tick()

    expect(observations.length).toBe(0)
  })

  it('uses resourceKey as the tracking key when provided', async () => {
    pipeline.publish('action:start_resource', { name: 'image', resourceKey: 'my-key' })
    pipeline.publish('action:stop_resource', { resourceKey: 'my-key' })
    await tick()

    expect(observations.length).toBe(1)
    const resource = (observations[0] as Record<string, unknown>).resource as Record<string, unknown>
    expect(resource.name).toBe('my-key')
  })

  it('includes context from start when stop has no context', async () => {
    pipeline.publish('action:start_resource', { name: 'load-image', context: { size: 'large' } })
    pipeline.publish('action:stop_resource', { name: 'load-image' })
    await tick()

    const obs = observations[0] as Record<string, unknown>
    expect(obs.context).toEqual({ size: 'large' })
  })

  it('merges context from start and stop', async () => {
    pipeline.publish('action:start_resource', { name: 'load-image', context: { size: 'large' } })
    pipeline.publish('action:stop_resource', { name: 'load-image', context: { cached: true } })
    await tick()

    const obs = observations[0] as Record<string, unknown>
    expect(obs.context).toEqual({ size: 'large', cached: true })
  })

  it('stop context overrides start context for same keys', async () => {
    pipeline.publish('action:start_resource', { name: 'load-image', context: { value: 'start' } })
    pipeline.publish('action:stop_resource', { name: 'load-image', context: { value: 'stop' } })
    await tick()

    const obs = observations[0] as Record<string, unknown>
    expect((obs.context as any).value).toBe('stop')
  })

  it('cleans up tracked resource after stop so second stop is a no-op', async () => {
    pipeline.publish('action:start_resource', { name: 'load-image' })
    pipeline.publish('action:stop_resource', { name: 'load-image' })
    pipeline.publish('action:stop_resource', { name: 'load-image' })
    await tick()

    expect(observations.length).toBe(1)
  })

  it('handles multiple concurrent resources independently', async () => {
    pipeline.publish('action:start_resource', { name: 'image-a' })
    pipeline.publish('action:start_resource', { name: 'image-b' })
    pipeline.publish('action:stop_resource', { name: 'image-a' })
    pipeline.publish('action:stop_resource', { name: 'image-b' })
    await tick()

    expect(observations.length).toBe(2)
    const names = observations.map(
      (o) => ((o as Record<string, unknown>).resource as Record<string, unknown>).name
    )
    expect(names).toContain('image-a')
    expect(names).toContain('image-b')
  })
})
