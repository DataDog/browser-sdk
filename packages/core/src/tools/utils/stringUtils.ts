import { dateNow } from './timeUtils'

const SESSION_DURATION = 15

export function generateUUID(deviceId?: string, applicationId?: string): string {
  if (!deviceId || !applicationId) {
    return generateRandomUUID()
  }
  return generateDeterministicUUID(deviceId, applicationId)
}

function getTimeFence(timestamp: number): string {
  return Math.ceil(timestamp / 1000 / (SESSION_DURATION * 60)).toString(16)
}

function getTimeSeed(deviceId: string, applicationId: string) {
  const timeFence = getTimeFence(dateNow())
  const applicationIdSeed = applicationId.replace(/[^0-9a-f]/g, '').slice(0, 13)
  const deviceIdSeed = deviceId.replace(/[^0-9a-f]/g, '').slice(0, 31 - timeFence.length - applicationId.length)
  const uuidSeed = timeFence + applicationIdSeed + deviceIdSeed
  return uuidSeed.padEnd(31, '0')
}

function generateDeterministicUUID(deviceId: string, applicationId: string) {
  const timeseed = getTimeSeed(deviceId, applicationId)
  return `${timeseed.slice(0, 8)}-${timeseed.slice(8, 12)}-4${timeseed.slice(12, 15)}-${timeseed.slice(15, 19)}-${timeseed.slice(19, 31)}`
}

/**
 * UUID v4
 * from https://gist.github.com/jed/982883
 */
function generateRandomUUID(placeholder?: string): string {
  return placeholder
    ? // eslint-disable-next-line  no-bitwise
      (parseInt(placeholder, 10) ^ ((Math.random() * 16) >> (parseInt(placeholder, 10) / 4))).toString(16)
    : `${1e7}-${1e3}-${4e3}-${8e3}-${1e11}`.replace(/[018]/g, generateRandomUUID)
}

const COMMA_SEPARATED_KEY_VALUE = /([\w-]+)\s*=\s*([^;]+)/g

/**
 * Returns the value of the key with the given name
 * If there are multiple values with the same key, returns the first one
 */
export function findCommaSeparatedValue(rawString: string, name: string): string | undefined {
  COMMA_SEPARATED_KEY_VALUE.lastIndex = 0
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

/**
 * Returns a map of all the values with the given key
 * If there are multiple values with the same key, returns all the values
 */
export function findAllCommaSeparatedValues(rawString: string): Map<string, string[]> {
  const result = new Map<string, string[]>()
  COMMA_SEPARATED_KEY_VALUE.lastIndex = 0
  while (true) {
    const match = COMMA_SEPARATED_KEY_VALUE.exec(rawString)
    if (match) {
      const key = match[1]
      const value = match[2]
      if (result.has(key)) {
        result.get(key)!.push(value)
      } else {
        result.set(key, [value])
      }
    } else {
      break
    }
  }
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
  COMMA_SEPARATED_KEY_VALUE.lastIndex = 0
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
