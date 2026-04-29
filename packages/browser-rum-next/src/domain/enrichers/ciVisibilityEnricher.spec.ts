import { ciVisibilityEnricher } from './ciVisibilityEnricher'

function withCiGlobal(value: any, fn: () => void) {
  const win = window as any
  const prev = win.__DD_CITEST__
  win.__DD_CITEST__ = value
  try {
    fn()
  } finally {
    win.__DD_CITEST__ = prev
  }
}

describe('ciVisibilityEnricher', () => {
  it('should have name "ciVisibility"', () => {
    const enricher = ciVisibilityEnricher()

    expect(enricher.name).toBe('ciVisibility')
  })

  it('should return data unchanged when __DD_CITEST__ is not set', () => {
    withCiGlobal(undefined, () => {
      const enricher = ciVisibilityEnricher()
      const data = { type: 'error' }
      const result = enricher.transform(data)

      expect(result).toEqual(data)
    })
  })

  it('should stamp ci_test when __DD_CITEST__ is set', () => {
    withCiGlobal({ testExecutionId: 'exec-abc-123' }, () => {
      const enricher = ciVisibilityEnricher()
      const result = enricher.transform({ type: 'view' }) as Record<string, unknown>
      const ciTest = result.ci_test as Record<string, unknown>

      expect(ciTest.test_execution_id).toBe('exec-abc-123')
    })
  })

  it('should preserve other top-level fields', () => {
    withCiGlobal({ testExecutionId: 'exec-1' }, () => {
      const enricher = ciVisibilityEnricher()
      const result = enricher.transform({ type: 'action', date: 777 }) as Record<string, unknown>

      expect(result.type).toBe('action')
      expect(result.date).toBe(777)
    })
  })
})
