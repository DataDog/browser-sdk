/**
 * Extract path parts from a simple JSON path, return [] for an invalid path
 *
 * Examples:
 * parseJsonPath("['foo'].bar[12]")
 * => ['foo', 'bar', '12']
 *
 * parseJsonPath("['foo")
 * => []
 *
 * Supports:
 * - dot notation
 * - bracket notation
 * - array exact index
 *
 * Useful references:
 * - https://goessner.net/articles/JsonPath/
 * - https://jsonpath.com/
 * - https://github.com/jsonpath-standard
 */
export function parseJsonPath(path: string): string[] {
  const pathParts = []
  let previousToken = Token.START
  let currentToken: Token | undefined
  let currentPathPart = ''
  for (const char of path) {
    // find which kind of token is this char
    currentToken = ALLOWED_NEXT_TOKENS[previousToken].find((token) => TOKEN_PREDICATE[token](char))
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

const enum Token {
  START,
  VARIABLE_FIRST_LETTER,
  VARIABLE_LETTER,
  DOT,
  BRACKET_START,
  BRACKET_END,
  NUMBER_LETTER,
  QUOTE_START,
  QUOTE_END,
  PROPERTY_LETTER,
  ESCAPE,
  ESCAPABLE_LETTER,
  END,
}

const TOKEN_PREDICATE: { [token in Token]: (char: string) => boolean } = {
  [Token.VARIABLE_FIRST_LETTER]: (char: string) => /[a-zA-Z_$]/.test(char),
  [Token.VARIABLE_LETTER]: (char: string) => /[a-zA-Z0-9_$]/.test(char),
  [Token.DOT]: (char: string) => char === '.',
  [Token.BRACKET_START]: (char: string) => char === '[',
  [Token.BRACKET_END]: (char: string) => char === ']',
  [Token.NUMBER_LETTER]: (char: string) => !Number.isNaN(parseInt(char, 10)),
  [Token.QUOTE_START]: (char: string) => char === "'",
  [Token.QUOTE_END]: (char: string) => char === "'",
  // any char can be used in property
  [Token.PROPERTY_LETTER]: (_: string) => true,
  [Token.ESCAPE]: (char: string) => char === '\\',
  [Token.ESCAPABLE_LETTER]: (char: string) => "'/\\bfnrtu".includes(char),
  // no char should match to START or END
  [Token.START]: (_: string) => false,
  [Token.END]: (_: string) => false,
}

const ALLOWED_NEXT_TOKENS: { [token in Token]: Token[] } = {
  [Token.START]: [Token.VARIABLE_FIRST_LETTER, Token.BRACKET_START],
  [Token.VARIABLE_FIRST_LETTER]: [Token.VARIABLE_LETTER, Token.DOT, Token.BRACKET_START, Token.END],
  [Token.VARIABLE_LETTER]: [Token.VARIABLE_LETTER, Token.DOT, Token.BRACKET_START, Token.END],
  [Token.DOT]: [Token.VARIABLE_FIRST_LETTER],
  [Token.BRACKET_START]: [Token.QUOTE_START, Token.NUMBER_LETTER],
  [Token.BRACKET_END]: [Token.DOT, Token.BRACKET_START, Token.END],
  [Token.NUMBER_LETTER]: [Token.NUMBER_LETTER, Token.BRACKET_END],
  [Token.QUOTE_START]: [Token.ESCAPE, Token.QUOTE_END, Token.PROPERTY_LETTER],
  [Token.QUOTE_END]: [Token.BRACKET_END],
  [Token.PROPERTY_LETTER]: [Token.ESCAPE, Token.QUOTE_END, Token.PROPERTY_LETTER],
  [Token.ESCAPE]: [Token.ESCAPABLE_LETTER],
  [Token.ESCAPABLE_LETTER]: [Token.ESCAPE, Token.QUOTE_END, Token.PROPERTY_LETTER],
  [Token.END]: [],
}

// foo['bar\n'][12]
// ^^    ^ ^^   ^
const ALLOWED_PATH_PART_TOKENS = [
  Token.VARIABLE_FIRST_LETTER,
  Token.VARIABLE_LETTER,
  Token.NUMBER_LETTER,
  Token.PROPERTY_LETTER,
  Token.ESCAPE,
  Token.ESCAPABLE_LETTER,
]

// foo.bar['qux']
//    ^   ^     ^
const ALLOWED_PATH_PART_DELIMITER_TOKENS = [Token.DOT, Token.BRACKET_START, Token.BRACKET_END]
