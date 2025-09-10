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
    currentToken = findInSet(ALLOWED_NEXT_TOKENS[previousToken], (token) => TOKEN_PREDICATE[token](char, quoteContext))
    if (!currentToken) {
      return []
    }
    if (ALLOWED_PATH_PART_TOKENS.has(currentToken)) {
      // buffer the char if it belongs to the path part
      // ex: foo['bar']
      //      ^    ^
      currentPathPart += char
    } else if (ALLOWED_PATH_PART_DELIMITER_TOKENS.has(currentToken) && currentPathPart !== '') {
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
  if (!ALLOWED_NEXT_TOKENS[previousToken].has(Token.END)) {
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
 * 2. VARIABLE_FIRST_LETTER: f        |   |        |  |
 * 3. VARIABLE_LETTER: oo             |   |        |  |
 * 4. DOT: . <------------------------+   |        |  |
 * 5. VARIABLE_FIRST_LETTER: b            |        |  |
 * 6. VARIABLE_LETTER: ar                 |        |  |
 * 7. BRACKET_START: [ <------------------+        |  |
 * 8. QUOTE_START: '                               |  |
 * 9. QUOTE_PROPERTY_LETTER: qu                    |  |
 * 10. QUOTE_ESCAPE: \                             |  |
 * 11. QUOTE_ESCAPABLE_LETTER: '                   |  |
 * 12. QUOTE_PROPERTY_LETTER: x                    |  |
 * 13. QUOTE_END: '                                |  |
 * 14. BRACKET_END: ]                              |  |
 * 15. BRACKET_START: [ <--------------------------+  |
 * 16. NUMBER_LETTER: 0                               |
 * 17. BRACKET_END: ]                                 |
 * 18. END (after last char) <------------------------+
 */
const enum Token {
  START,
  END,

  VARIABLE_FIRST_LETTER,
  VARIABLE_LETTER,
  DOT,

  BRACKET_START,
  BRACKET_END,
  NUMBER_LETTER,

  QUOTE_START,
  QUOTE_END,
  QUOTE_PROPERTY_LETTER,
  QUOTE_ESCAPE,
  QUOTE_ESCAPABLE_LETTER,
}

const VARIABLE_FIRST_LETTER = /[a-zA-Z_$]/
const VARIABLE_LETTER = /[a-zA-Z0-9_$]/
const NUMBER_CHAR = /[0-9]/
// see https://www.rfc-editor.org/rfc/rfc9535.html#name-semantics-3
const QUOTE_ESCAPABLE_LETTERS = '/\\bfnrtu'
const QUOTE_CHAR = '\'"'

const TOKEN_PREDICATE: { [token in Token]: (char: string, quoteContext?: string) => boolean } = {
  // no char should match to START or END
  [Token.START]: (_: string) => false,
  [Token.END]: (_: string) => false,

  [Token.VARIABLE_FIRST_LETTER]: (char: string) => VARIABLE_FIRST_LETTER.test(char),
  [Token.VARIABLE_LETTER]: (char: string) => VARIABLE_LETTER.test(char),
  [Token.DOT]: (char: string) => char === '.',

  [Token.BRACKET_START]: (char: string) => char === '[',
  [Token.BRACKET_END]: (char: string) => char === ']',
  [Token.NUMBER_LETTER]: (char: string) => NUMBER_CHAR.test(char),

  [Token.QUOTE_START]: (char: string) => QUOTE_CHAR.includes(char),
  [Token.QUOTE_END]: (char: string, quoteContext?: string) => char === quoteContext,
  [Token.QUOTE_PROPERTY_LETTER]: (_: string) => true, // any char can be used in property
  [Token.QUOTE_ESCAPE]: (char: string) => char === '\\',
  [Token.QUOTE_ESCAPABLE_LETTER]: (char: string, quoteContext?: string) =>
    `${quoteContext}${QUOTE_ESCAPABLE_LETTERS}`.includes(char),
}

const ALLOWED_NEXT_TOKENS: { [token in Token]: Set<Token> } = {
  [Token.START]: new Set([Token.VARIABLE_FIRST_LETTER, Token.BRACKET_START]),
  [Token.END]: new Set([]),

  [Token.VARIABLE_FIRST_LETTER]: new Set([Token.VARIABLE_LETTER, Token.DOT, Token.BRACKET_START, Token.END]),
  [Token.VARIABLE_LETTER]: new Set([Token.VARIABLE_LETTER, Token.DOT, Token.BRACKET_START, Token.END]),
  [Token.DOT]: new Set([Token.VARIABLE_FIRST_LETTER]),

  [Token.BRACKET_START]: new Set([Token.QUOTE_START, Token.NUMBER_LETTER]),
  [Token.BRACKET_END]: new Set([Token.DOT, Token.BRACKET_START, Token.END]),
  [Token.NUMBER_LETTER]: new Set([Token.NUMBER_LETTER, Token.BRACKET_END]),

  [Token.QUOTE_START]: new Set([Token.QUOTE_ESCAPE, Token.QUOTE_END, Token.QUOTE_PROPERTY_LETTER]),
  [Token.QUOTE_END]: new Set([Token.BRACKET_END]),
  [Token.QUOTE_PROPERTY_LETTER]: new Set([Token.QUOTE_ESCAPE, Token.QUOTE_END, Token.QUOTE_PROPERTY_LETTER]),
  [Token.QUOTE_ESCAPE]: new Set([Token.QUOTE_ESCAPABLE_LETTER]),
  [Token.QUOTE_ESCAPABLE_LETTER]: new Set([Token.QUOTE_ESCAPE, Token.QUOTE_END, Token.QUOTE_PROPERTY_LETTER]),
}

// foo['bar\n'][12]
// ^^    ^ ^^   ^
const ALLOWED_PATH_PART_TOKENS = new Set([
  Token.VARIABLE_FIRST_LETTER,
  Token.VARIABLE_LETTER,
  Token.NUMBER_LETTER,

  Token.QUOTE_PROPERTY_LETTER,
  Token.QUOTE_ESCAPE,
  Token.QUOTE_ESCAPABLE_LETTER,
])

// foo.bar['qux']
//    ^   ^     ^
const ALLOWED_PATH_PART_DELIMITER_TOKENS = new Set([Token.DOT, Token.BRACKET_START, Token.BRACKET_END])

function findInSet<T>(set: Set<T>, predicate: (item: T) => boolean): T | undefined {
  for (const item of set) {
    if (predicate(item)) {
      return item
    }
  }
}
