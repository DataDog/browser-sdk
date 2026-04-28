import { DEFAULT_PROPAGATOR_TYPES, findTracingOption, normalizeTracingOptions } from './matchUrl'

describe('findTracingOption', () => {
  it('matches URL by string prefix', () => {
    const options = normalizeTracingOptions(['https://api.example.com'])
    const match = findTracingOption('https://api.example.com/users', options)

    expect(match).toBeDefined()
  })

  it('does not match URL when string is not a prefix', () => {
    const options = normalizeTracingOptions(['https://api.example.com'])
    const match = findTracingOption('https://other.com/users', options)

    expect(match).toBeUndefined()
  })

  it('matches URL by RegExp', () => {
    const options = normalizeTracingOptions([/^https:\/\/api\./])
    const match = findTracingOption('https://api.example.com/users', options)

    expect(match).toBeDefined()
  })

  it('does not match URL when RegExp does not match', () => {
    const options = normalizeTracingOptions([/^https:\/\/api\./])
    const match = findTracingOption('https://other.com/users', options)

    expect(match).toBeUndefined()
  })

  it('matches URL by function', () => {
    const options = normalizeTracingOptions([(url) => url.includes('api')])
    const match = findTracingOption('https://api.example.com/users', options)

    expect(match).toBeDefined()
  })

  it('does not match URL when function returns false', () => {
    const options = normalizeTracingOptions([(url) => url.includes('api')])
    const match = findTracingOption('https://other.com/users', options)

    expect(match).toBeUndefined()
  })

  it('returns undefined for empty options', () => {
    const match = findTracingOption('https://api.example.com', [])

    expect(match).toBeUndefined()
  })

  it('returns first matching option', () => {
    const options = normalizeTracingOptions([
      { match: 'https://api.example.com', propagatorTypes: ['datadog'] },
      { match: 'https://api.example.com', propagatorTypes: ['b3'] },
    ])
    const match = findTracingOption('https://api.example.com/users', options)

    expect(match?.propagatorTypes).toEqual(['datadog'])
  })
})

describe('normalizeTracingOptions', () => {
  it('adds default propagator types for plain strings', () => {
    const options = normalizeTracingOptions(['https://api.example.com'])

    expect(options[0]?.propagatorTypes).toEqual(DEFAULT_PROPAGATOR_TYPES)
  })

  it('adds default propagator types for RegExp', () => {
    const options = normalizeTracingOptions([/api/])

    expect(options[0]?.propagatorTypes).toEqual(DEFAULT_PROPAGATOR_TYPES)
  })

  it('adds default propagator types for function', () => {
    const options = normalizeTracingOptions([() => true])

    expect(options[0]?.propagatorTypes).toEqual(DEFAULT_PROPAGATOR_TYPES)
  })

  it('preserves explicit propagatorTypes from object', () => {
    const options = normalizeTracingOptions([{ match: 'https://api.example.com', propagatorTypes: ['b3', 'b3multi'] }])

    expect(options[0]?.propagatorTypes).toEqual(['b3', 'b3multi'])
  })

  it('normalizes mixed inputs', () => {
    const options = normalizeTracingOptions([
      'https://api.example.com',
      /api/,
      { match: /other/, propagatorTypes: ['datadog'] },
    ])

    expect(options.length).toBe(3)
    expect(options[0]?.propagatorTypes).toEqual(DEFAULT_PROPAGATOR_TYPES)
    expect(options[1]?.propagatorTypes).toEqual(DEFAULT_PROPAGATOR_TYPES)
    expect(options[2]?.propagatorTypes).toEqual(['datadog'])
  })
})

describe('DEFAULT_PROPAGATOR_TYPES', () => {
  it('contains tracecontext and datadog', () => {
    expect(DEFAULT_PROPAGATOR_TYPES).toContain('tracecontext')
    expect(DEFAULT_PROPAGATOR_TYPES).toContain('datadog')
  })
})
