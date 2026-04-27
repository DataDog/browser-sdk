/**
 * Executes a RegExp against a string and returns the first capture group, or the full match if
 * there is no capture group. Returns undefined when the pattern does not match.
 */
export function extractRegexMatch(candidate: string, extractor: RegExp): string | undefined {
  // Prevent stateful matching when the RegExp has the global or sticky flag
  extractor.lastIndex = 0

  const regexResult = extractor.exec(candidate)
  if (!regexResult) {
    return undefined
  }
  const [match, capture] = regexResult
  return capture ? capture : match
}
