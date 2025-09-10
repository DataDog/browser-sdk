/**
 * Terminology inspired from https://www.rfc-editor.org/rfc/rfc9535.html
 *
 * jsonpath-query      = segment*
 * segment             = .name-shorthand / bracketed-selection
 * bracketed-selection = ['name-selector'] / ["name-selector"] / [index-selector]
 *
 * Useful references:
 * - https://goessner.net/articles/JsonPath/
 * - https://jsonpath.com/
 * - https://github.com/jsonpath-standard
 */

/**
 * Extract selectors from a simple JSON path expression, return [] for an invalid path
 *
 * Supports:
 * - Dot notation: `foo.bar.baz`
 * - Bracket notation: `['foo']["bar"]`
 * - Array indices: `items[0]`, `data['users'][1]`
 *
 * Examples:
 * parseJsonPath("['foo'].bar[12]")
 * => ['foo', 'bar', '12']
 *
 * parseJsonPath("['foo")
 * => []
 */
export function parseJsonPath(path: string): string[] {
  const selectors: string[] = []
  let previousToken = Token.START
  let currentToken: Token | undefined
  let quoteContext: string | undefined
  let currentSelector = ''
  for (const char of path) {
    // find which kind of token is this char
    currentToken = ALLOWED_NEXT_TOKENS[previousToken].find((token) => TOKEN_PREDICATE[token](char, quoteContext))
    if (!currentToken) {
      return []
    }
    if (ALLOWED_SELECTOR_TOKENS.includes(currentToken)) {
      // buffer the char if it belongs to the selector
      // ex: foo['bar']
      //      ^    ^
      currentSelector += char
    } else if (ALLOWED_SELECTOR_DELIMITER_TOKENS.includes(currentToken) && currentSelector !== '') {
      // close the current path part if we have reach a path part delimiter
      // ex: foo.bar['qux']
      //        ^   ^     ^
      selectors.push(currentSelector)
      currentSelector = ''
    } else if (currentToken === Token.QUOTE_START) {
      quoteContext = char
    } else if (currentToken === Token.QUOTE_END) {
      quoteContext = undefined
    }
    previousToken = currentToken
  }
  if (!ALLOWED_NEXT_TOKENS[previousToken].includes(Token.END)) {
    return []
  }
  if (currentSelector !== '') {
    selectors.push(currentSelector)
  }
  return selectors
}

/**
 * List of all tokens in the path
 *
 * @example                        foo.bar['qu\'x'][0]
 *                                |   |   |        |  |
 * Token sequence:                |   |   |        |  |
 * 1. START (before first char) <-+   |   |        |  |
 * 2. NAME_SHORTHAND_FIRST_CHAR: f    |   |        |  |
 * 3. NAME_SHORTHAND_CHAR: oo         |   |        |  |
 * 4. DOT: . <------------------------+   |        |  |
 * 5. NAME_SHORTHAND_FIRST_CHAR: b        |        |  |
 * 6. NAME_SHORTHAND_CHAR: ar             |        |  |
 * 7. BRACKET_START: [ <------------------+        |  |
 * 8. QUOTE_START: '                               |  |
 * 9. NAME_SELECTOR_CHAR: qu                       |  |
 * 10. ESCAPE: \                                   |  |
 * 11. ESCAPABLE_CHAR: '                           |  |
 * 12. NAME_SELECTOR_CHAR: x                       |  |
 * 13. QUOTE_END: '                                |  |
 * 14. BRACKET_END: ]                              |  |
 * 15. BRACKET_START: [ <--------------------------+  |
 * 16. DIGIT: 0                                       |
 * 17. BRACKET_END: ]                                 |
 * 18. END (after last char) <------------------------+
 */
const enum Token {
  START,
  END,

  NAME_SHORTHAND_FIRST_CHAR,
  NAME_SHORTHAND_CHAR,
  DOT,

  BRACKET_START,
  BRACKET_END,
  DIGIT,

  QUOTE_START,
  QUOTE_END,
  NAME_SELECTOR_CHAR,
  ESCAPE,
  ESCAPABLE_CHAR,
}

const NAME_SHORTHAND_FIRST_CHAR_REGEX = /[a-zA-Z_$]/
const NAME_SHORTHAND_CHAR_REGEX = /[a-zA-Z0-9_$]/
const DIGIT_REGEX = /[0-9]/
const ESCAPABLE_CHARS = '/\\bfnrtu' // see https://www.rfc-editor.org/rfc/rfc9535.html#name-semantics-3
const QUOTE_CHARS = '\'"'

const TOKEN_PREDICATE: { [token in Token]: (char: string, quoteContext?: string) => boolean } = {
  // no char should match to START or END
  [Token.START]: () => false,
  [Token.END]: () => false,

  [Token.NAME_SHORTHAND_FIRST_CHAR]: (char) => NAME_SHORTHAND_FIRST_CHAR_REGEX.test(char),
  [Token.NAME_SHORTHAND_CHAR]: (char) => NAME_SHORTHAND_CHAR_REGEX.test(char),
  [Token.DOT]: (char) => char === '.',

  [Token.BRACKET_START]: (char) => char === '[',
  [Token.BRACKET_END]: (char) => char === ']',
  [Token.DIGIT]: (char) => DIGIT_REGEX.test(char),

  [Token.QUOTE_START]: (char) => QUOTE_CHARS.includes(char),
  [Token.QUOTE_END]: (char, quoteContext) => char === quoteContext,
  [Token.NAME_SELECTOR_CHAR]: () => true, // any char can be used in name selector
  [Token.ESCAPE]: (char) => char === '\\',
  [Token.ESCAPABLE_CHAR]: (char, quoteContext) => `${quoteContext}${ESCAPABLE_CHARS}`.includes(char),
}

const ALLOWED_NEXT_TOKENS: { [token in Token]: Token[] } = {
  [Token.START]: [Token.NAME_SHORTHAND_FIRST_CHAR, Token.BRACKET_START],
  [Token.END]: [],

  [Token.NAME_SHORTHAND_FIRST_CHAR]: [Token.NAME_SHORTHAND_CHAR, Token.DOT, Token.BRACKET_START, Token.END],
  [Token.NAME_SHORTHAND_CHAR]: [Token.NAME_SHORTHAND_CHAR, Token.DOT, Token.BRACKET_START, Token.END],
  [Token.DOT]: [Token.NAME_SHORTHAND_FIRST_CHAR],

  [Token.BRACKET_START]: [Token.QUOTE_START, Token.DIGIT],
  [Token.BRACKET_END]: [Token.DOT, Token.BRACKET_START, Token.END],
  [Token.DIGIT]: [Token.DIGIT, Token.BRACKET_END],

  [Token.QUOTE_START]: [Token.ESCAPE, Token.QUOTE_END, Token.NAME_SELECTOR_CHAR],
  [Token.QUOTE_END]: [Token.BRACKET_END],
  [Token.NAME_SELECTOR_CHAR]: [Token.ESCAPE, Token.QUOTE_END, Token.NAME_SELECTOR_CHAR],
  [Token.ESCAPE]: [Token.ESCAPABLE_CHAR],
  [Token.ESCAPABLE_CHAR]: [Token.ESCAPE, Token.QUOTE_END, Token.NAME_SELECTOR_CHAR],
}

// foo['bar\n'][12]
// ^^    ^ ^^   ^
const ALLOWED_SELECTOR_TOKENS = [
  Token.NAME_SHORTHAND_FIRST_CHAR,
  Token.NAME_SHORTHAND_CHAR,
  Token.DIGIT,

  Token.NAME_SELECTOR_CHAR,
  Token.ESCAPE,
  Token.ESCAPABLE_CHAR,
]

// foo.bar['qux']
//    ^   ^     ^
const ALLOWED_SELECTOR_DELIMITER_TOKENS = [Token.DOT, Token.BRACKET_START, Token.BRACKET_END]
