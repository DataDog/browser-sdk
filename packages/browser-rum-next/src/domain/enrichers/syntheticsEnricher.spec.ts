import { syntheticsEnricher } from './syntheticsEnricher'

function withSyntheticsGlobals(
  globals: { testId?: string; resultId?: string; injectsRum?: boolean },
  fn: () => void
) {
  const win = window as any
  const prev = {
    testId: win._DATADOG_SYNTHETICS_BROWSER_TEST_ID,
    resultId: win._DATADOG_SYNTHETICS_BROWSER_RESULT_ID,
    injects: win._DATADOG_SYNTHETICS_INJECTS_RUM,
  }

  if (globals.testId !== undefined) win._DATADOG_SYNTHETICS_BROWSER_TEST_ID = globals.testId
  if (globals.resultId !== undefined) win._DATADOG_SYNTHETICS_BROWSER_RESULT_ID = globals.resultId
  if (globals.injectsRum !== undefined) win._DATADOG_SYNTHETICS_INJECTS_RUM = globals.injectsRum

  try {
    fn()
  } finally {
    win._DATADOG_SYNTHETICS_BROWSER_TEST_ID = prev.testId
    win._DATADOG_SYNTHETICS_BROWSER_RESULT_ID = prev.resultId
    win._DATADOG_SYNTHETICS_INJECTS_RUM = prev.injects
  }
}

describe('syntheticsEnricher', () => {
  it('should have name "synthetics"', () => {
    const enricher = syntheticsEnricher()

    expect(enricher.name).toBe('synthetics')
  })

  it('should return data unchanged when not in a synthetics context', () => {
    withSyntheticsGlobals({}, () => {
      const enricher = syntheticsEnricher()
      const data = { type: 'error' }
      const result = enricher.transform(data)

      expect(result).toEqual(data)
    })
  })

  it('should stamp synthetics when test globals are set', () => {
    withSyntheticsGlobals({ testId: 'test-abc', resultId: 'result-xyz', injectsRum: true }, () => {
      const enricher = syntheticsEnricher()
      const result = enricher.transform({ type: 'view' }) as Record<string, unknown>
      const synthetics = result.synthetics as Record<string, unknown>

      expect(synthetics.test_id).toBe('test-abc')
      expect(synthetics.result_id).toBe('result-xyz')
      expect(synthetics.injected).toBe(true)
    })
  })

  it('should set injected to false when _DATADOG_SYNTHETICS_INJECTS_RUM is not set', () => {
    withSyntheticsGlobals({ testId: 'test-abc' }, () => {
      const enricher = syntheticsEnricher()
      const result = enricher.transform({ type: 'error' }) as Record<string, unknown>
      const synthetics = result.synthetics as Record<string, unknown>

      expect(synthetics.injected).toBe(false)
    })
  })

  it('should preserve other top-level fields', () => {
    withSyntheticsGlobals({ testId: 'test-1' }, () => {
      const enricher = syntheticsEnricher()
      const result = enricher.transform({ type: 'resource', date: 42 }) as Record<string, unknown>

      expect(result.type).toBe('resource')
      expect(result.date).toBe(42)
    })
  })
})
