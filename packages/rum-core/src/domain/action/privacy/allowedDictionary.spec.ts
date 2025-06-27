import { ACTION_NAME_PLACEHOLDER } from '../getActionNameFromElement'
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
  PARAGRAPH_MIXED: 'This is a test paragraph with various symbols: 💥, $$$, 123, and more.',
}

const LANGUAGES_TEST_STRINGS = {
  FRENCH_MIXED_SENTENCE: "C'est un test avec des mots français et des symboles: 💥, $$$, 123, et plus. Bonjour!",
  SPANISH_MIXED_SENTENCE: 'Este es un test con palabras en español y símbolos: 💥, $$$, 123, y más. ¡Hola!',
  GERMAN_MIXED_SENTENCE: 'Das ist ein Test mit deutschen Wörtern und Symbolen: 💥, $$$, 123, und mehr. Hallo!',
  ITALIAN_MIXED_SENTENCE: 'Questo è un test con parole in italiano e simboli: 💥, $$$, 123, e altro. Ciao!',
  PORTUGUESE_MIXED_SENTENCE: 'Este é um teste com palavras em português e símbolos: 💥, $$$, 123, e mais. Olá!',
}
if (isBrowserSupported()) {
  describe('Test tokenize', () => {
    it('should handle emojis when Browser supports unicode regex', () => {
      const paragraphMixedTokens = tokenize(TEST_STRINGS.PARAGRAPH_MIXED)
      expect(paragraphMixedTokens).toContain('💥')
      expect(paragraphMixedTokens).not.toContain('$$$')
      expect(paragraphMixedTokens).not.toContain('123')
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
      const paragraphMixedTokens = tokenize(TEST_STRINGS.PARAGRAPH_MIXED)
      const expectedParagraphMixed = [
        'This',
        'is',
        'a',
        'test',
        'paragraph',
        'with',
        'various',
        'symbols',
        'and',
        'more',
      ]
      expectedParagraphMixed.forEach((expected) => {
        expect(paragraphMixedTokens).toContain(expected)
      })
      const frenchTokens = tokenize(LANGUAGES_TEST_STRINGS.FRENCH_MIXED_SENTENCE)
      const expectedFrench = [
        'C',
        'est',
        'un',
        'test',
        'avec',
        'des',
        'mots',
        'français',
        'et',
        'des',
        'symboles',
        'et',
        'plus',
        'Bonjour',
      ]
      expectedFrench.forEach((expected) => {
        expect(frenchTokens).toContain(expected)
      })

      const spanishTokens = tokenize(LANGUAGES_TEST_STRINGS.SPANISH_MIXED_SENTENCE)
      const expectedSpanish = [
        'Este',
        'es',
        'un',
        'test',
        'con',
        'palabras',
        'en',
        'español',
        'y',
        'símbolos',
        'y',
        'más',
        'Hola',
      ]
      expectedSpanish.forEach((expected) => {
        expect(spanishTokens).toContain(expected)
      })

      const germanTokens = tokenize(LANGUAGES_TEST_STRINGS.GERMAN_MIXED_SENTENCE)
      const expectedGerman = [
        'Das',
        'ist',
        'ein',
        'Test',
        'mit',
        'deutschen',
        'Wörtern',
        'und',
        'Symbolen',
        'und',
        'mehr',
        'Hallo',
      ]
      expectedGerman.forEach((expected) => {
        expect(germanTokens).toContain(expected)
      })

      const portugueseTokens = tokenize(LANGUAGES_TEST_STRINGS.PORTUGUESE_MIXED_SENTENCE)
      const expectedPortuguese = [
        'Este',
        'é',
        'um',
        'teste',
        'com',
        'palavras',
        'em',
        'português',
        'e',
        'símbolos',
        'e',
        'mais',
        'Olá',
      ]
      expectedPortuguese.forEach((expected) => {
        expect(portugueseTokens).toContain(expected)
      })
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
    let expected = 'test-💥-xxxxxx-xxx'
    if (!isBrowserSupported()) {
      expected = ACTION_NAME_PLACEHOLDER
    }

    const testString1 = maskActionName('test-💥-$>=123-pii', actionNameDictionary.allowlist)
    expect(testString1.masked).toBeTrue()
    expect(testString1.name).toBe(expected)

    expected = 'test-xxxxxx*hello xxxx'
    if (!isBrowserSupported()) {
      expected = ACTION_NAME_PLACEHOLDER
    }
    const testString2 = maskActionName('test-💥+123*hello wild', actionNameDictionary.allowlist)
    expect(testString2.masked).toBeTrue()
    expect(testString2.name).toBe(expected)
  })

  it('handles empty string', () => {
    const result = maskActionName('', actionNameDictionary.allowlist)
    expect(result.masked).toBeFalse()
    expect(result.name).toBe('')
  })
})
