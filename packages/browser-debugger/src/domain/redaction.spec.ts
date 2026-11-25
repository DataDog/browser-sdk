import { describe, expect, it } from 'vitest'
import { isRedactedIdentifier } from './redaction'

describe('isRedactedIdentifier', () => {
  it('should match sensitive identifiers', () => {
    expect(isRedactedIdentifier('password')).toBe(true)
    expect(isRedactedIdentifier('token')).toBe(true)
    expect(isRedactedIdentifier('ssn')).toBe(true)
  })

  it('should ignore case and separators', () => {
    expect(isRedactedIdentifier('apiKey')).toBe(true)
    expect(isRedactedIdentifier('api_key')).toBe(true)
    expect(isRedactedIdentifier('X-Api-Key')).toBe(true)
    expect(isRedactedIdentifier('$password')).toBe(true)
    expect(isRedactedIdentifier('@session.id')).toBe(true)
    expect(isRedactedIdentifier(' Authorization ')).toBe(true)
  })

  it('should not match other identifiers', () => {
    expect(isRedactedIdentifier('username')).toBe(false)
    expect(isRedactedIdentifier('passwordHint')).toBe(false)
    expect(isRedactedIdentifier('tokens')).toBe(false)
    expect(isRedactedIdentifier('')).toBe(false)
  })
})
