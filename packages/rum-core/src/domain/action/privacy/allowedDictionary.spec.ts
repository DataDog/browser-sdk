import {
  addAllowlistObserver,
  createActionAllowList,
  getMatchRegex,
  processRawAllowList,
  maskActionName,
} from './allowedDictionary'

const TEST_STRINGS = {
  EMOJI: '💥',
  EMOJI_WITH_NUMBERS: '💥123',
  SPECIAL_CHARS: '$$$',
  SPECIAL_CHARS_WITH_NUMBERS: '$$$123',
  HYPHENATED_SPECIAL_CHARS: '$$$-123',
  COMPLEX_MIXED: 'test-<$>-123 hello>=42@world?',
}

describe('allowedDictionary', () => {
  beforeEach(() => {
    window.$DD_ALLOW = new Set([
      TEST_STRINGS.EMOJI,
      TEST_STRINGS.EMOJI_WITH_NUMBERS,
      TEST_STRINGS.SPECIAL_CHARS,
      TEST_STRINGS.SPECIAL_CHARS_WITH_NUMBERS,
      TEST_STRINGS.HYPHENATED_SPECIAL_CHARS,
      TEST_STRINGS.COMPLEX_MIXED,
    ])
  })

  afterEach(() => {
    window.$DD_ALLOW = undefined as any
    window.$DD_ALLOW_OBSERVERS = undefined
  })

  it('should not initialize if $DD_ALLOW is not defined', () => {
    window.$DD_ALLOW = undefined as any
    const dict = createActionAllowList()
    expect(dict.lastRawString).toBeUndefined()
  })

  it('MATCH_REGEX matches words and symbols in TEST_STRINGS', () => {
    expect(TEST_STRINGS.EMOJI.match(getMatchRegex())).toEqual(['💥'])
    expect(TEST_STRINGS.EMOJI_WITH_NUMBERS.match(getMatchRegex())).toEqual(['💥123'])
    expect(TEST_STRINGS.SPECIAL_CHARS.match(getMatchRegex())).toEqual(['$$$'])
    expect(TEST_STRINGS.SPECIAL_CHARS_WITH_NUMBERS.match(getMatchRegex())).toEqual(['$$$123'])
    expect(TEST_STRINGS.HYPHENATED_SPECIAL_CHARS.match(getMatchRegex())).toEqual(['$$$', '123'])
    expect(TEST_STRINGS.COMPLEX_MIXED.match(getMatchRegex())).toEqual(['test', '<$>', '123', 'hello', '>=42', 'world'])
  })

  it('initializes allowlist with normalized words from $DD_ALLOW', () => {
    const dict = createActionAllowList()
    // EMOJI and EMOJI_WITH_NUMBERS
    expect(dict.allowlist.has('123')).toBeTrue()
    // COMPLEX_MIXED
    expect(dict.allowlist.has('test')).toBeTrue()
    expect(dict.allowlist.has('hello')).toBeTrue()
    expect(dict.allowlist.has('>=42')).toBeTrue()
    expect(dict.allowlist.has('world')).toBeTrue()
  })

  describe('maskActionName', () => {
    it('should not run if $DD_ALLOW is not defined', () => {
      window.$DD_ALLOW = undefined as any
      const dict = createActionAllowList()
      const testString = maskActionName('mask-feature-off', dict.allowlist)
      expect(testString.masked).toBeFalse()
      expect(testString.name).toBe('mask-feature-off')
    })

    it('masks words not in allowlist (with dictionary from $DD_ALLOW)', () => {
      const dict = createActionAllowList()
      const testString1 = maskActionName('test-💥-$>=123-pii', dict.allowlist)
      expect(testString1.masked).toBeTrue()
      expect(testString1.name).toBe('test-💥-MASKED-MASKED')
      const testString2 = maskActionName('test-💥+123*hello wild', dict.allowlist)
      expect(testString2.masked).toBeTrue()
      expect(testString2.name).toBe('test-MASKED*hello MASKED')
    })

    it('handles empty string', () => {
      const dict = createActionAllowList()
      const result = maskActionName('', dict.allowlist)
      expect(result.masked).toBeFalse()
      expect(result.name).toBe('')
    })
  })

  it('updates dictionary when $DD_ALLOW changes', () => {
    const dict = createActionAllowList()
    expect(dict.allowlist.size).toBe(10)

    // Simulate a change in $DD_ALLOW
    window.$DD_ALLOW?.add('new-Word')
    window.$DD_ALLOW?.add('another-Word')
    // Trigger the observer manually
    processRawAllowList(window.$DD_ALLOW, dict)

    // Verify dictionary is updated with new words
    expect(dict.allowlist.has('word')).toBeTrue()
    expect(dict.allowlist.has('new')).toBeTrue()
    expect(dict.allowlist.has('another')).toBeTrue()
    // Old words should still be present
    expect(dict.allowlist.size).toBe(13)
  })

  describe('addAllowlistObserver', () => {
    it('creates a new set and add an observer if it does not exist', () => {
      const dict = createActionAllowList()
      window.$DD_ALLOW_OBSERVERS = undefined as any
      addAllowlistObserver(dict)
      expect(window.$DD_ALLOW_OBSERVERS?.size).toBe(1)
    })
  })
})
