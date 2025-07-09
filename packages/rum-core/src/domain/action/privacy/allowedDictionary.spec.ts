import { ActionType } from '../../../rawRumEvent.types'
import { NodePrivacyLevel } from '../../privacy'
import { ActionNameSource, ACTION_NAME_PLACEHOLDER } from '../getActionNameFromElement'
import type { ClickActionBase } from '../trackClickActions'
import {
  createActionAllowList,
  processRawAllowList,
  maskActionName,
  tokenize,
  isBrowserSupported,
} from './allowedDictionary'
import type { AllowedDictionary } from './allowedDictionary'

const TEST_STRINGS = {
  COMPLEX_MIXED: 'test-user-name:💥$$$, test-user-id:hello>=42@world?',
  PARAGRAPH_MIXED: "This isn't a sentence, it's RUM's test: 💥, $$$ = 1 + 2 + 3, and more.",
}

const LANGUAGES_TEST_STRINGS = {
  FRENCH_MIXED_SENTENCE: "C'est pas un test, c'est RUM's test: 💥, $$$ = 1 + 2 + 3, et plus.",
  SPANISH_MIXED_SENTENCE: "Este no es un test, es RUM's test: 💥, $$$ = 1 + 2 + 3, y más.",
  GERMAN_MIXED_SENTENCE: "Das ist kein Test, das ist RUM's Test: 💥, $$$ = 1 + 2 + 3, und mehr.",
  ITALIAN_MIXED_SENTENCE: "Questo non è un test, questo è RUM's test: 💥, $$$ = 1 + 2 + 3, e altro.",
  PORTUGUESE_MIXED_SENTENCE: "Este não é um teste, este é RUM's test: 💥, $$$ = 1 + 2 + 3, e mais.",
}
if (isBrowserSupported()) {
  describe('Test tokenize', () => {
    it('should handle emojis when Browser supports unicode regex', () => {
      const paragraphMixedTokens = tokenize(TEST_STRINGS.PARAGRAPH_MIXED)
      expect(paragraphMixedTokens).toContain('💥')
      expect(paragraphMixedTokens).not.toContain('$$$')
      expect(paragraphMixedTokens).not.toContain('1')
      expect(paragraphMixedTokens).not.toContain('2')
      expect(paragraphMixedTokens).not.toContain('3')
    })

    it('should return empty array for whitespace-only strings', () => {
      expect(tokenize(' ')).toEqual([])
      expect(tokenize('  ')).toEqual([])
      expect(tokenize('\t')).toEqual([])
      expect(tokenize('\n')).toEqual([])
      expect(tokenize('\r')).toEqual([])
      expect(tokenize('   \t\n\r   ')).toEqual([])
    })

    /**
     * This test is to ensure that the match regex is working as expected in all browsers.
     * With unicode regex, we can support symbols and emojis OOTB.
     * But in older versions of browsers, we need to use a minimal fallback regex which does
     * not support many symbols, to avoid bloating the bundle size.
     *
     * Only European languages (Except Russian) are tested here.
     * We can't test Russian because it's not supported by the fallback regex.
     * Asian languages are not supported by our current tokenizer strategy.
     */
    it('Tokenized results matches words and symbols in TEST_STRINGS', () => {
      const expectedParagraphMixed = [
        'This',
        "isn't",
        'a',
        'sentence',
        "it's",
        "RUM's",
        'test',
        '💥',
        '=',
        '+',
        '+',
        'and',
        'more',
      ]
      expect(tokenize(TEST_STRINGS.PARAGRAPH_MIXED).sort()).toEqual(expectedParagraphMixed.sort())

      const expectedFrench = ["C'est", 'pas', 'un', 'test', "c'est", "RUM's", 'test', '💥', '=', '+', '+', 'et', 'plus']
      expect(tokenize(LANGUAGES_TEST_STRINGS.FRENCH_MIXED_SENTENCE).sort()).toEqual(expectedFrench.sort())

      const expectedSpanish = ['Este', 'no', 'es', 'un', 'test', 'es', "RUM's", 'test', '💥', '=', '+', '+', 'y', 'más']
      expect(tokenize(LANGUAGES_TEST_STRINGS.SPANISH_MIXED_SENTENCE).sort()).toEqual(expectedSpanish.sort())

      const expectedGerman = [
        'Das',
        'ist',
        'kein',
        'Test',
        'das',
        'ist',
        "RUM's",
        'Test',
        '💥',
        '=',
        '+',
        '+',
        'und',
        'mehr',
      ]
      expect(tokenize(LANGUAGES_TEST_STRINGS.GERMAN_MIXED_SENTENCE).sort()).toEqual(expectedGerman.sort())

      const expectedPortuguese = [
        'Este',
        'não',
        'é',
        'um',
        'teste',
        'este',
        'é',
        "RUM's",
        'test',
        '💥',
        '=',
        '+',
        '+',
        'e',
        'mais',
      ]
      expect(tokenize(LANGUAGES_TEST_STRINGS.PORTUGUESE_MIXED_SENTENCE).sort()).toEqual(expectedPortuguese.sort())
    })
  })
}

describe('createActionAllowList', () => {
  beforeAll(() => {
    window.$DD_ALLOW = new Set([TEST_STRINGS.COMPLEX_MIXED, TEST_STRINGS.PARAGRAPH_MIXED])
  })

  afterAll(() => {
    window.$DD_ALLOW = undefined
  })

  it('should create an action name dictionary and clear it', () => {
    const actionNameDictionary = createActionAllowList()
    if (!isBrowserSupported()) {
      expect(actionNameDictionary.allowlist.size).toBe(0)
      expect(actionNameDictionary.rawStringIterator).toBeDefined()
      return
    }
    expect(actionNameDictionary.allowlist.size).toBeGreaterThan(0)
    expect(actionNameDictionary.rawStringIterator).toBeDefined()
    actionNameDictionary.clear()
    expect(actionNameDictionary.allowlist.size).toBe(0)
    expect(actionNameDictionary.rawStringIterator).toBeUndefined()
  })

  it('should handle when $DD_ALLOW is undefined and redefined later', () => {
    window.$DD_ALLOW = undefined
    const actionNameDictionary = createActionAllowList()
    expect(actionNameDictionary.rawStringIterator).toBeUndefined()

    window.$DD_ALLOW = new Set([TEST_STRINGS.COMPLEX_MIXED, TEST_STRINGS.PARAGRAPH_MIXED])
    // Trigger the observer manually
    window.$DD_ALLOW_OBSERVERS?.forEach((observer) => observer())
    expect(actionNameDictionary.rawStringIterator).toBeDefined()
    actionNameDictionary.clear()
  })
})

if (isBrowserSupported()) {
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

    it('initializes allowlist with normalized words from $DD_ALLOW', () => {
      expect(actionNameDictionary.allowlist.has('test')).toBeTrue()
      expect(actionNameDictionary.allowlist.has('hello')).toBeTrue()
      expect(actionNameDictionary.allowlist.has('world')).toBeTrue()
    })

    it('updates dictionary when $DD_ALLOW changes', () => {
      const initialAllowlistSize = actionNameDictionary.allowlist.size

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
      expect(actionNameDictionary.allowlist.size).toBe(initialAllowlistSize + 3)
    })
  })
}

describe('createActionNameDictionary and maskActionName', () => {
  let actionNameDictionary: AllowedDictionary
  let clearActionNameDictionary: () => void
  const clickActionBase: ClickActionBase = {
    type: ActionType.CLICK,
    name: 'test-💥-xxxxxx-xxx',
    nameSource: ActionNameSource.MASK_DISALLOWED,
    target: {
      selector: 'button',
      width: 100,
      height: 100,
    },
    position: { x: 0, y: 0 },
  }

  beforeEach(() => {
    window.$DD_ALLOW = new Set([TEST_STRINGS.PARAGRAPH_MIXED])
    actionNameDictionary = createActionAllowList()
    clearActionNameDictionary = actionNameDictionary.clear
  })

  afterEach(() => {
    window.$DD_ALLOW = undefined
    clearActionNameDictionary()
  })

  it('should not run if $DD_ALLOW is not defined', () => {
    window.$DD_ALLOW = undefined as any
    clickActionBase.name = 'mask-feature-off'
    const testString = maskActionName(clickActionBase, NodePrivacyLevel.ALLOW, actionNameDictionary.allowlist)
    expect(testString.name).toBe('mask-feature-off')
    expect(testString.nameSource).toBe(ActionNameSource.MASK_DISALLOWED)
  })

  it('masks words not in allowlist (with dictionary from $DD_ALLOW)', () => {
    clickActionBase.name = "test this: if 💥 isn't pii"
    let expected = "test this: xx 💥 isn't xxx"
    if (!isBrowserSupported()) {
      expected = ACTION_NAME_PLACEHOLDER
    }
    const testString1 = maskActionName(clickActionBase, NodePrivacyLevel.MASK, actionNameDictionary.allowlist)
    expect(testString1.name).toBe(expected)
    expect(testString1.nameSource).toBe(ActionNameSource.MASK_DISALLOWED)

    clickActionBase.name = 'test-💥+123*hello wild'
    expected = 'test-💥+xxxxxxxxx xxxx'
    if (!isBrowserSupported()) {
      expected = ACTION_NAME_PLACEHOLDER
    }
    const testString2 = maskActionName(clickActionBase, NodePrivacyLevel.MASK, actionNameDictionary.allowlist)
    expect(testString2.name).toBe(expected)
    expect(testString2.nameSource).toBe(ActionNameSource.MASK_DISALLOWED)
  })

  it('handles empty string', () => {
    clickActionBase.name = ''
    const result = maskActionName(clickActionBase, NodePrivacyLevel.ALLOW, actionNameDictionary.allowlist)
    expect(result.name).toBe('')
    expect(result.nameSource).toBe(ActionNameSource.MASK_DISALLOWED)
  })
})
