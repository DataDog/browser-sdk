import { ACTION_NAME_MASK } from '../actionNameConstants'
import { maskDisallowedTextContent } from './maskWithAllowlist'

const TEST_STRINGS = {
  COMPLEX_MIXED: 'test-team-name:💥$$$',
  PARAGRAPH_MIXED: '✅ This is an action name in allowlist',
}

describe('maskWithAllowlist', () => {
  beforeEach(() => {
    window.$DD_ALLOW = new Set([TEST_STRINGS.PARAGRAPH_MIXED])
  })

  afterEach(() => {
    window.$DD_ALLOW = undefined
  })

  it('should fail close if $DD_ALLOW is not defined', () => {
    window.$DD_ALLOW = undefined as any
    const testString = maskDisallowedTextContent('mask-feature-on', ACTION_NAME_MASK)
    expect(testString).toBe(ACTION_NAME_MASK)
  })

  it('masks words not in allowlist (with dictionary from $DD_ALLOW)', () => {
    const testString1 = maskDisallowedTextContent('This is an action name in allowlist', ACTION_NAME_MASK)
    expect(testString1).toBe(ACTION_NAME_MASK)

    const testString2 = maskDisallowedTextContent('any unallowed string', ACTION_NAME_MASK)
    expect(testString2).toBe(ACTION_NAME_MASK)
  })

  it('handles empty string', () => {
    const result = maskDisallowedTextContent('', ACTION_NAME_MASK)
    expect(result).toBe('')
  })
})
