/**
 * UUID v4
 * from https://gist.github.com/jed/982883
 */
export function generateUUID(placeholder?: string): string {
  return placeholder
    ? // eslint-disable-next-line  no-bitwise
      (parseInt(placeholder, 10) ^ ((Math.random() * 16) >> (parseInt(placeholder, 10) / 4))).toString(16)
    : `${1e7}-${1e3}-${4e3}-${8e3}-${1e11}`.replace(/[018]/g, generateUUID)
}

/**
 * Walks a string in the HTTP Cookie format defined in
 * https://www.ietf.org/rfc/rfc2616.txt and https://www.ietf.org/rfc/rfc6265.txt,
 * calling back with each `name=value` pair.
 *
 * This used to be `/(\S+?)\s*=\s*(.*?)(?:;|$)/g`, which had two problems.
 *
 * It backtracked quadratically. Every start position expanded the lazy `\S+?`
 * one character at a time looking for an `=`, and with the `g` flag that runs
 * from every position in the string:
 *
 *     input     parse time
 *      8,000        18.5ms
 *     32,000       274.0ms
 *    128,000     4,464.6ms
 *    512,000    69,608.6ms
 *
 * `document.cookie` is attacker-influenced on any site that lets a visitor set
 * a cookie, and this runs on the main thread on every session read.
 *
 * It also lost cookies. After a segment with no `=` in it, the next match
 * started ON the `;`, so the name came out as `;second` and every pair after
 * that point became unreachable:
 *
 *     findCommaSeparatedValue('a=1;;b=2', 'b')       // was undefined
 *     findCommaSeparatedValue('noequals;foo=1', 'foo') // was undefined
 *
 * Browsers really do produce those: `document.cookie = 'foo'` stores a cookie
 * with no name, and reading `document.cookie` returns a bare value with no
 * `=`. One of those anywhere in the jar hid every cookie written after it,
 * including the SDK's own session cookie.
 *
 * Scanning by index has neither behaviour and is linear — the 512,000 case
 * above takes 0.02ms.
 */
function forEachCommaSeparatedValue(
  rawString: string,
  callback: (name: string, value: string) => boolean | void
): void {
  let start = 0
  while (start <= rawString.length) {
    let end = rawString.indexOf(';', start)
    if (end === -1) {
      end = rawString.length
    }
    const separator = rawString.indexOf('=', start)
    if (separator !== -1 && separator < end) {
      const name = rawString.slice(start, separator).trim()
      // `\s*=\s*` skipped whitespace on both sides of the separator, and
      // nothing trimmed the end of the value — a cookie written as
      // `foo = a ;` yielded `'a '`, which the tests below still pin.
      const value = rawString.slice(separator + 1, end).replace(/^\s+/, '')
      if (callback(name, value) === true) {
        return
      }
    }
    start = end + 1
  }
}

/**
 * Returns the value of the key with the given name
 * If there are multiple values with the same key, returns the first one
 */
export function findCommaSeparatedValue(rawString: string, name: string): string | undefined {
  let found: string | undefined
  forEachCommaSeparatedValue(rawString, (key, value) => {
    if (key === name) {
      found = value
      return true
    }
  })
  return found
}

/**
 * Returns a map of all the values with the given key
 * If there are multiple values with the same key, returns all the values
 */
export function findAllCommaSeparatedValues(rawString: string): Map<string, string[]> {
  const result = new Map<string, string[]>()
  forEachCommaSeparatedValue(rawString, (key, value) => {
    const existing = result.get(key)
    if (existing) {
      existing.push(value)
    } else {
      result.set(key, [value])
    }
  })
  return result
}

/**
 * Returns a map of the values with the given key
 * ⚠️ If there are multiple values with the same key, returns the LAST one
 *
 * @deprecated use `findAllCommaSeparatedValues()` instead
 */
export function findCommaSeparatedValues(rawString: string): Map<string, string> {
  const result = new Map<string, string>()
  forEachCommaSeparatedValue(rawString, (key, value) => {
    result.set(key, value)
  })
  return result
}

export function safeTruncate(candidate: string, length: number, suffix = '') {
  const lastChar = candidate.charCodeAt(length - 1)
  const isLastCharSurrogatePair = lastChar >= 0xd800 && lastChar <= 0xdbff
  const correctedLength = isLastCharSurrogatePair ? length + 1 : length

  if (candidate.length <= correctedLength) {
    return candidate
  }

  return `${candidate.slice(0, correctedLength)}${suffix}`
}

/**
 * Builds a telemetry integration identifier from a library name and its version, e.g. `react-v18`
 */
export function toMajorVersionIntegration(name: string, version: string | null | undefined): string {
  if (!version) {
    return name
  }
  return `${name}-v${version.split('.')[0]}`
}

/**
 * Filters out falsy values and returns `undefined` if no integration is left, so plugins report a
 * consistent "nothing to report" telemetry shape instead of an empty array.
 */
export function toIntegrations(...maybeIntegrations: Array<string | false | undefined>): string[] | undefined {
  const integrations = maybeIntegrations.filter((integration): integration is string => !!integration)
  return integrations.length > 0 ? integrations : undefined
}
