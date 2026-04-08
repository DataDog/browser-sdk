import { DISCARD } from '@datadog/core-next'
import { beforeSendEnricher } from './beforeSendEnricher'

describe('beforeSendEnricher', () => {
  it('should discard the event when beforeSend returns false', () => {
    const enricher = beforeSendEnricher(() => false)
    const result = enricher.transform({ message: 'test' })

    expect(result).toBe(DISCARD)
  })

  it('should pass through the event when beforeSend returns undefined', () => {
    const enricher = beforeSendEnricher(() => undefined)
    const result = enricher.transform({ message: 'test' })

    expect(result).toEqual({ message: 'test' })
  })

  it('should pass through the event when beforeSend returns true', () => {
    const enricher = beforeSendEnricher(() => true)
    const result = enricher.transform({ message: 'test' })

    expect(result).toEqual({ message: 'test' })
  })

  it('should allow beforeSend to modify the event in place', () => {
    const enricher = beforeSendEnricher((event) => {
      event.custom = 'injected'
    })
    const result = enricher.transform({ message: 'test' }) as Record<string, unknown>

    expect(result.custom).toBe('injected')
  })

  it('should have name "beforeSend"', () => {
    const enricher = beforeSendEnricher(() => true)

    expect(enricher.name).toBe('beforeSend')
  })
})
