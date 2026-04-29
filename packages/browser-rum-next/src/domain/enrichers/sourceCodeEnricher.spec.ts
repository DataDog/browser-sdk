import { sourceCodeEnricher } from './sourceCodeEnricher'

const STACK_WITH_URL = `Error: something went wrong
    at Object.<anonymous> (https://example.com/bundle.js:1:100)
    at Module._compile (internal/modules/cjs/loader.js:1063:30)`

const STACK_WITHOUT_URL = `Error: something went wrong
    at Object.<anonymous> (bundle.js:1:100)
    at Module._compile (loader.js:1063:30)`

describe('sourceCodeEnricher', () => {
  it('should have name "sourceCode"', () => {
    const enricher = sourceCodeEnricher()

    expect(enricher.name).toBe('sourceCode')
  })

  it('should return data unchanged when there is no error field', () => {
    const enricher = sourceCodeEnricher()
    const data = { type: 'view', view: { url: 'https://example.com' } }
    const result = enricher.transform(data)

    expect(result).toEqual(data)
  })

  it('should return data unchanged when error has no stack', () => {
    const enricher = sourceCodeEnricher()
    const data = { type: 'error', error: { message: 'oops', type: 'Error' } }
    const result = enricher.transform(data)

    expect(result).toEqual(data)
  })

  it('should return data unchanged when stack has no URL', () => {
    const enricher = sourceCodeEnricher()
    const data = { type: 'error', error: { message: 'oops', stack: STACK_WITHOUT_URL } }
    const result = enricher.transform(data)

    expect(result).toEqual(data)
  })

  it('should add _dd.error_source_type when error has a stack with URL', () => {
    const enricher = sourceCodeEnricher()
    const result = enricher.transform({
      type: 'error',
      error: { message: 'oops', stack: STACK_WITH_URL },
    }) as Record<string, unknown>
    const dd = result._dd as Record<string, unknown>

    expect(dd.error_source_type).toBe('browser')
  })

  it('should merge with existing _dd fields', () => {
    const enricher = sourceCodeEnricher()
    const result = enricher.transform({
      type: 'error',
      error: { message: 'oops', stack: STACK_WITH_URL },
      _dd: { trace_id: 'abc123' },
    }) as Record<string, unknown>
    const dd = result._dd as Record<string, unknown>

    expect(dd.trace_id).toBe('abc123')
    expect(dd.error_source_type).toBe('browser')
  })

  it('should preserve other top-level fields', () => {
    const enricher = sourceCodeEnricher()
    const result = enricher.transform({
      type: 'error',
      date: 12345,
      error: { message: 'oops', stack: STACK_WITH_URL },
    }) as Record<string, unknown>

    expect(result.type).toBe('error')
    expect(result.date).toBe(12345)
  })
})
