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

const COMMA_SEPARATED_KEY_VALUE = /([\w-]+)\s*=\s*([^;]+)/g

export function findCommaSeparatedValue(rawString: string, name: string): string | undefined {
  COMMA_SEPARATED_KEY_VALUE.lastIndex = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const match = COMMA_SEPARATED_KEY_VALUE.exec(rawString)
    if (match) {
      if (match[1] === name) {
        return match[2]
      }
    } else {
      break
    }
  }
}

export function findCommaSeparatedValues(rawString: string): Map<string, string> {
  const result = new Map<string, string>()
  COMMA_SEPARATED_KEY_VALUE.lastIndex = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const match = COMMA_SEPARATED_KEY_VALUE.exec(rawString)
    if (match) {
      result.set(match[1], match[2])
    } else {
      break
    }
  }
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
