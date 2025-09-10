/**
 * Extract path parts from a simple JSON path expression, return [] for an invalid path
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
 *
 *
 * Useful references:
 * - https://goessner.net/articles/JsonPath/
 * - https://jsonpath.com/
 * - https://github.com/jsonpath-standard
 */
export function parseJsonPath(path: string): string[] {
  const pathParts: string[] = []
  let previousToken = Token.START
  let currentToken: Token | undefined
  let quoteContext: string | undefined
  let currentPathPart = ''
  for (const char of path) {
    // find which kind of token is this char
    currentToken = ALLOWED_NEXT_TOKENS[previousToken].find((token) => TOKEN_PREDICATE[token](char, quoteContext))
    if (!currentToken) {
      return []
    }
    if (ALLOWED_PATH_PART_TOKENS.includes(currentToken)) {
      // buffer the char if it belongs to the path part
      // ex: foo['bar']
      //      ^    ^
      currentPathPart += char
    } else if (ALLOWED_PATH_PART_DELIMITER_TOKENS.includes(currentToken) && currentPathPart !== '') {
      // close the current path part if we have reach a path part delimiter
      // ex: foo.bar['qux']
      //        ^   ^     ^
      pathParts.push(currentPathPart)
      currentPathPart = ''
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
  if (currentPathPart !== '') {
    pathParts.push(currentPathPart)
  }
  return pathParts
}

/**
 * List of all tokens in the path
 *
 * @example                        foo.bar['qu\'x'][0]
 *                                |   |   |        |  |
 * Token sequence:                |   |   |        |  |
 * 1. START (before first char) <-+   |   |        |  |
 * 2. VARIABLE_FIRST_CHAR: f          |   |        |  |
 * 3. VARIABLE_CHAR: oo               |   |        |  |
 * 4. DOT: . <------------------------+   |        |  |
 * 5. VARIABLE_FIRST_CHAR: b              |        |  |
 * 6. VARIABLE_CHAR: ar                   |        |  |
 * 7. BRACKET_START: [ <------------------+        |  |
 * 8. QUOTE_START: '                               |  |
 * 9. QUOTE_PROPERTY_CHAR: qu                      |  |
 * 10. QUOTE_ESCAPE: \                             |  |
 * 11. QUOTE_ESCAPABLE_CHAR: '                     |  |
 * 12. QUOTE_PROPERTY_CHAR: x                      |  |
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

  VARIABLE_FIRST_CHAR,
  VARIABLE_CHAR,
  DOT,

  BRACKET_START,
  BRACKET_END,
  DIGIT,

  QUOTE_START,
  QUOTE_END,
  QUOTE_PROPERTY_CHAR,
  QUOTE_ESCAPE,
  QUOTE_ESCAPABLE_CHAR,
}

const VARIABLE_FIRST_CHAR = /[a-zA-Z_$]/
const VARIABLE_CHAR = /[a-zA-Z0-9_$]/
const DIGIT = /[0-9]/
// see https://www.rfc-editor.org/rfc/rfc9535.html#name-semantics-3
const QUOTE_ESCAPABLE_CHARS = '/\\bfnrtu'
const QUOTE_CHAR = '\'"'

const TOKEN_PREDICATE: { [token in Token]: (char: string, quoteContext?: string) => boolean } = {
  // no char should match to START or END
  [Token.START]: () => false,
  [Token.END]: () => false,

  [Token.VARIABLE_FIRST_CHAR]: (char) => VARIABLE_FIRST_CHAR.test(char),
  [Token.VARIABLE_CHAR]: (char) => VARIABLE_CHAR.test(char),
  [Token.DOT]: (char) => char === '.',

  [Token.BRACKET_START]: (char) => char === '[',
  [Token.BRACKET_END]: (char) => char === ']',
  [Token.DIGIT]: (char) => DIGIT.test(char),

  [Token.QUOTE_START]: (char) => QUOTE_CHAR.includes(char),
  [Token.QUOTE_END]: (char, quoteContext) => char === quoteContext,
  [Token.QUOTE_PROPERTY_CHAR]: () => true, // any char can be used in property
  [Token.QUOTE_ESCAPE]: (char) => char === '\\',
  [Token.QUOTE_ESCAPABLE_CHAR]: (char, quoteContext) => `${quoteContext}${QUOTE_ESCAPABLE_CHARS}`.includes(char),
}

const ALLOWED_NEXT_TOKENS: { [token in Token]: Token[] } = {
  [Token.START]: [Token.VARIABLE_FIRST_CHAR, Token.BRACKET_START],
  [Token.END]: [],

  [Token.VARIABLE_FIRST_CHAR]: [Token.VARIABLE_CHAR, Token.DOT, Token.BRACKET_START, Token.END],
  [Token.VARIABLE_CHAR]: [Token.VARIABLE_CHAR, Token.DOT, Token.BRACKET_START, Token.END],
  [Token.DOT]: [Token.VARIABLE_FIRST_CHAR],

  [Token.BRACKET_START]: [Token.QUOTE_START, Token.DIGIT],
  [Token.BRACKET_END]: [Token.DOT, Token.BRACKET_START, Token.END],
  [Token.DIGIT]: [Token.DIGIT, Token.BRACKET_END],

  [Token.QUOTE_START]: [Token.QUOTE_ESCAPE, Token.QUOTE_END, Token.QUOTE_PROPERTY_CHAR],
  [Token.QUOTE_END]: [Token.BRACKET_END],
  [Token.QUOTE_PROPERTY_CHAR]: [Token.QUOTE_ESCAPE, Token.QUOTE_END, Token.QUOTE_PROPERTY_CHAR],
  [Token.QUOTE_ESCAPE]: [Token.QUOTE_ESCAPABLE_CHAR],
  [Token.QUOTE_ESCAPABLE_CHAR]: [Token.QUOTE_ESCAPE, Token.QUOTE_END, Token.QUOTE_PROPERTY_CHAR],
}

// foo['bar\n'][12]
// ^^    ^ ^^   ^
const ALLOWED_PATH_PART_TOKENS = [
  Token.VARIABLE_FIRST_CHAR,
  Token.VARIABLE_CHAR,
  Token.DIGIT,

  Token.QUOTE_PROPERTY_CHAR,
  Token.QUOTE_ESCAPE,
  Token.QUOTE_ESCAPABLE_CHAR,
]

// foo.bar['qux']
//    ^   ^     ^
const ALLOWED_PATH_PART_DELIMITER_TOKENS = [Token.DOT, Token.BRACKET_START, Token.BRACKET_END]
