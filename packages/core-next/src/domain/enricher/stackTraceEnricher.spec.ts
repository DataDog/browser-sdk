import { stackTraceEnricher } from './stackTraceEnricher'

describe('stackTraceEnricher', () => {
  it('should normalize the stack from the error object', () => {
    const error = new Error('test')
    const enricher = stackTraceEnricher()
    const result = enricher.transform({ error, stack: undefined }) as Record<string, unknown>

    expect(result.stack).toContain('Error: test')
    expect(result.stack).toContain('  at ')
  })

  it('should pass through when no error field', () => {
    const enricher = stackTraceEnricher()
    const input = { message: 'hello', stack: undefined }
    const result = enricher.transform(input)

    expect(result).toEqual(input)
  })

  it('should pass through when error has no parseable stack', () => {
    const enricher = stackTraceEnricher()
    const error = { name: 'Error', message: 'no stack' }
    const result = enricher.transform({ error, stack: undefined }) as Record<string, unknown>

    expect(result.stack).toBeUndefined()
  })

  it('should preserve other fields', () => {
    const error = new Error('test')
    const enricher = stackTraceEnricher()
    const result = enricher.transform({ error, api: 'error', message: 'test' }) as Record<string, unknown>

    expect(result.api).toBe('error')
    expect(result.message).toBe('test')
    expect(result.error).toBe(error)
  })

  it('should have name "stackTrace"', () => {
    expect(stackTraceEnricher().name).toBe('stackTrace')
  })
})
