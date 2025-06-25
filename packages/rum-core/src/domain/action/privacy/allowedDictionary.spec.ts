import { createActionAllowList, getMatchRegex, processRawAllowList, maskActionName } from './allowedDictionary'
import type { AllowedDictionary } from './allowedDictionary'

const TEST_STRINGS = {
  COMPLEX_MIXED: 'test-user-name:💥$$$, test-user-id:hello>=42@world?',
  PARAGRAPH_MIXED: 'This is a test paragraph with various symbols: 💥, $$$, 123, and more.',
}

describe('createActionAllowList', () => {
  beforeAll(() => {
    window.$DD_ALLOW = new Set([TEST_STRINGS.COMPLEX_MIXED, TEST_STRINGS.PARAGRAPH_MIXED])
  })

  afterAll(() => {
    window.$DD_ALLOW = undefined
  })

  it('should create an action name dictionary', () => {
    const actionNameDictionary = createActionAllowList()
    expect(actionNameDictionary.allowlist.size).toBe(20)
    expect(actionNameDictionary.rawStringIterator).toBeDefined()
  })

  it('should handle when $DD_ALLOW is undefined and redefined later', () => {
    window.$DD_ALLOW = undefined
    const actionNameDictionary = createActionAllowList()
    expect(actionNameDictionary.rawStringIterator).toBeUndefined()

    window.$DD_ALLOW = new Set([TEST_STRINGS.COMPLEX_MIXED, TEST_STRINGS.PARAGRAPH_MIXED])
    // Trigger the observer manually
    window.$DD_ALLOW_OBSERVERS?.forEach((observer) => observer())
    expect(actionNameDictionary.rawStringIterator).toBeDefined()
  })
})

describe('actionNameDictionary processing', () => {
  let actionNameDictionary: AllowedDictionary
  let clearActionNameDictionary: () => void

  beforeEach(() => {
    window.$DD_ALLOW = new Set([TEST_STRINGS.COMPLEX_MIXED, TEST_STRINGS.PARAGRAPH_MIXED])
    actionNameDictionary = createActionAllowList()
    clearActionNameDictionary = actionNameDictionary.clear
  })

  afterEach(() => {
    window.$DD_ALLOW = undefined
    clearActionNameDictionary()
  })

  it('MATCH_REGEX matches words and symbols in TEST_STRINGS', () => {
    expect(TEST_STRINGS.COMPLEX_MIXED.match(getMatchRegex())).toEqual(
      jasmine.arrayContaining(['test', 'user', 'name', '💥$$$', 'test', 'user', 'id', 'hello', '>=42', 'world'])
    )
    expect(TEST_STRINGS.PARAGRAPH_MIXED.match(getMatchRegex())).toEqual(
      jasmine.arrayContaining([
        'This',
        'is',
        'a',
        'test',
        'paragraph',
        'with',
        'various',
        'symbols',
        '💥',
        '$$$',
        '123',
        'and',
        'more',
      ])
    )
  })

  it('initializes allowlist with normalized words from $DD_ALLOW', () => {
    // EMOJI and EMOJI_WITH_NUMBERS
    expect(actionNameDictionary.allowlist.has('123')).toBeTrue()
    // COMPLEX_MIXED
    expect(actionNameDictionary.allowlist.has('test')).toBeTrue()
    expect(actionNameDictionary.allowlist.has('hello')).toBeTrue()
    expect(actionNameDictionary.allowlist.has('>=42')).toBeTrue()
    expect(actionNameDictionary.allowlist.has('world')).toBeTrue()
  })

  it('updates dictionary when $DD_ALLOW changes', () => {
    expect(actionNameDictionary.allowlist.size).toBe(20)

    // Simulate a change in $DD_ALLOW
    window.$DD_ALLOW?.add('new-Word')
    window.$DD_ALLOW?.add('another-Word')
    // Trigger the observer manually
    processRawAllowList(window.$DD_ALLOW, actionNameDictionary)

    // Verify dictionary is updated with new words
    expect(actionNameDictionary.allowlist.has('word')).toBeTrue()
    expect(actionNameDictionary.allowlist.has('new')).toBeTrue()
    expect(actionNameDictionary.allowlist.has('another')).toBeTrue()
    // Old words should still be present
    expect(actionNameDictionary.allowlist.size).toBe(23)
  })
})

describe('maskActionName', () => {
  let actionNameDictionary: AllowedDictionary
  let clearActionNameDictionary: () => void

  beforeEach(() => {
    window.$DD_ALLOW = new Set([TEST_STRINGS.COMPLEX_MIXED, TEST_STRINGS.PARAGRAPH_MIXED])
    actionNameDictionary = createActionAllowList()
    clearActionNameDictionary = actionNameDictionary.clear
  })

  afterEach(() => {
    window.$DD_ALLOW = undefined
    clearActionNameDictionary()
  })

  it('should not run if $DD_ALLOW is not defined', () => {
    window.$DD_ALLOW = undefined as any
    const testString = maskActionName('mask-feature-off', actionNameDictionary.allowlist)
    expect(testString.masked).toBeFalse()
    expect(testString.name).toBe('mask-feature-off')
  })

  it('masks words not in allowlist (with dictionary from $DD_ALLOW)', () => {
    const testString1 = maskActionName('test-💥-$>=123-pii', actionNameDictionary.allowlist)
    expect(testString1.masked).toBeTrue()
    expect(testString1.name).toBe('test-💥-***-***')
    const testString2 = maskActionName('test-💥+123*hello wild', actionNameDictionary.allowlist)
    expect(testString2.masked).toBeTrue()
    expect(testString2.name).toBe('test-****hello ***')
  })

  it('handles empty string', () => {
    const result = maskActionName('', actionNameDictionary.allowlist)
    expect(result.masked).toBeFalse()
    expect(result.name).toBe('')
  })
})
