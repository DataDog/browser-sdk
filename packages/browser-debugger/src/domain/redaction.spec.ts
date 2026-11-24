import { isRedactedIdentifier } from './redaction'

describe('isRedactedIdentifier', () => {
  it('should match sensitive identifiers', () => {
    expect(isRedactedIdentifier('password')).toBeTrue()
    expect(isRedactedIdentifier('token')).toBeTrue()
    expect(isRedactedIdentifier('ssn')).toBeTrue()
  })

  it('should ignore case and separators', () => {
    expect(isRedactedIdentifier('apiKey')).toBeTrue()
    expect(isRedactedIdentifier('api_key')).toBeTrue()
    expect(isRedactedIdentifier('X-Api-Key')).toBeTrue()
    expect(isRedactedIdentifier('$password')).toBeTrue()
    expect(isRedactedIdentifier('@session.id')).toBeTrue()
    expect(isRedactedIdentifier(' Authorization ')).toBeTrue()
  })

  it('should not match other identifiers', () => {
    expect(isRedactedIdentifier('username')).toBeFalse()
    expect(isRedactedIdentifier('passwordHint')).toBeFalse()
    expect(isRedactedIdentifier('tokens')).toBeFalse()
    expect(isRedactedIdentifier('')).toBeFalse()
  })
})
