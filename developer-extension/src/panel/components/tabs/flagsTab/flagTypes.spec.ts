import { flagTypeLabel, validateOverrideValue, type FlagType } from './flagTypes'

describe('flagTypeLabel', () => {
  it('returns the display label, or the raw type for an unsupported value_type', () => {
    expect(flagTypeLabel('BOOLEAN')).toBe('Boolean')
    expect(flagTypeLabel('NUMERIC')).toBe('Number')
    // An API value_type we don't model yet must not crash — fall back to the raw type.
    expect(flagTypeLabel('MYSTERY' as FlagType)).toBe('MYSTERY')
  })
})

describe('validateOverrideValue', () => {
  it('accepts values matching their declared type', () => {
    expect(validateOverrideValue('BOOLEAN', true)).toBeNull()
    expect(validateOverrideValue('STRING', 'hello')).toBeNull()
    expect(validateOverrideValue('INTEGER', 3)).toBeNull()
    expect(validateOverrideValue('NUMERIC', 3.14)).toBeNull()
    expect(validateOverrideValue('JSON', { a: 1 })).toBeNull()
  })

  it('returns an error (rather than crashing) for a value_type outside the known union', () => {
    expect(validateOverrideValue('MYSTERY' as FlagType, 'x')).toContain('Unsupported flag type')
  })

  it('rejects null by default but accepts a JSON null when allowNull is set', () => {
    expect(validateOverrideValue('STRING', null)).toBe('Value cannot be null')
    expect(validateOverrideValue('JSON', null)).toBe('Value cannot be null')
    // A JSON variant can legitimately be null (typeof null === 'object' matches JSON).
    expect(validateOverrideValue('JSON', null, { allowNull: true })).toBeNull()
    // allowNull still enforces the type — null isn't valid for a non-object type.
    expect(validateOverrideValue('BOOLEAN', null, { allowNull: true })).toContain('must be a boolean')
  })

  it('rejects type mismatches', () => {
    expect(validateOverrideValue('BOOLEAN', 'true')).toContain('must be a boolean')
    expect(validateOverrideValue('STRING', 1)).toContain('must be a string')
    expect(validateOverrideValue('NUMERIC', 'x')).toContain('must be a number')
  })

  it('rejects non-integer and unsafe INTEGER values', () => {
    expect(validateOverrideValue('INTEGER', 3.5)).toContain('whole number')
    // Beyond Number.MAX_SAFE_INTEGER: not a reliable integer, so reject it too.
    expect(validateOverrideValue('INTEGER', Number.MAX_SAFE_INTEGER + 1)).toContain('safe integer range')
  })
})
