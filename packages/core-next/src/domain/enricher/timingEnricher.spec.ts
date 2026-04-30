import { timingEnricher } from './timingEnricher'

describe('timingEnricher', () => {
  it('converts view.time_spent from ms to ns', () => {
    const e = timingEnricher()
    const result = e.transform({ type: 'view', view: { time_spent: 100 } })
    expect((result as any).view.time_spent).toBe(100_000_000)
  })

  it('converts resource.duration from ms to ns', () => {
    const e = timingEnricher()
    const result = e.transform({ type: 'resource', resource: { duration: 50 } })
    expect((result as any).resource.duration).toBe(50_000_000)
  })

  it('converts nested resource timing phases', () => {
    const e = timingEnricher()
    const result = e.transform({ type: 'resource', resource: { dns: { duration: 10, start: 5 } } })
    expect((result as any).resource.dns.duration).toBe(10_000_000)
    expect((result as any).resource.dns.start).toBe(5_000_000)
  })

  it('does not convert CLS score', () => {
    const e = timingEnricher()
    const result = e.transform({ type: 'view', view: { cumulative_layout_shift: 0.1 } })
    expect((result as any).view.cumulative_layout_shift).toBe(0.1)
  })

  it('converts action.loading_time', () => {
    const e = timingEnricher()
    const result = e.transform({ type: 'action', action: { loading_time: 200 } })
    expect((result as any).action.loading_time).toBe(200_000_000)
  })

  it('converts long_task.duration', () => {
    const e = timingEnricher()
    const result = e.transform({ type: 'long_task', long_task: { duration: 80 } })
    expect((result as any).long_task.duration).toBe(80_000_000)
  })

  it('converts script duration fields in arrays', () => {
    const e = timingEnricher()
    const result = e.transform({ scripts: [{ duration: 30, execution_start: 10 }] })
    expect((result as any).scripts[0].duration).toBe(30_000_000)
    expect((result as any).scripts[0].execution_start).toBe(10_000_000)
  })

  it('handles missing fields gracefully', () => {
    const e = timingEnricher()
    const result = e.transform({ type: 'view', view: {} })
    expect(result).toBeDefined()
  })

  it('does not convert undefined values', () => {
    const e = timingEnricher()
    const result = e.transform({ type: 'view', view: { first_byte: undefined } })
    expect((result as any).view.first_byte).toBeUndefined()
  })
})
