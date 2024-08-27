import { DOCS_ORIGIN, MORE_DETAILS, display } from '../../tools/display'
import type { InitConfiguration } from './configuration'

export const TAG_SIZE_LIMIT = 200

export function buildTags(configuration: InitConfiguration): string[] {
  const { env, service, version, datacenter } = configuration
  const tags = []

  if (env) {
    tags.push(buildTag('env', env))
  }
  if (service) {
    tags.push(buildTag('service', service))
  }
  if (version) {
    tags.push(buildTag('version', version))
  }
  if (datacenter) {
    tags.push(buildTag('datacenter', datacenter))
  }

  return tags
}

export function buildTag(key: string, rawValue: string) {
  // See https://docs.datadoghq.com/getting_started/tagging/#defining-tags for tags syntax. Note
  // that the backend may not follow the exact same rules, so we only want to display an informal
  // warning.
  const valueSizeLimit = TAG_SIZE_LIMIT - key.length - 1

  if (rawValue.length > valueSizeLimit || hasForbiddenCharacters(rawValue)) {
    display.warn(
      `${key} value doesn't meet tag requirements and will be sanitized. ${MORE_DETAILS} ${DOCS_ORIGIN}/getting_started/tagging/#defining-tags`
    )
  }

  // Let the backend do most of the sanitization, but still make sure multiple tags can't be crafted
  // by forging a value containing commas.
  const sanitizedValue = rawValue.replace(/,/g, '_')

  return `${key}:${sanitizedValue}`
}

function hasForbiddenCharacters(rawValue: string) {
  // Unicode property escapes is not supported in all browsers, so we use a try/catch.
  // Todo: Remove the try/catch when dropping IE11.
  try {
    // We use the Unicode property escapes to match any character that is a letter including other languages like Chinese, Japanese, etc.
    // p{Ll} matches a lowercase letter.
    // p{Lo} matches a letter that is neither uppercase nor lowercase (ex: Japanese characters).
    // See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Unicode_character_class_escape#unicode_property_escapes_vs._character_classes
    return new RegExp('[^\\p{Ll}\\p{Lo}0-9_:./-]', 'u').test(rawValue)
  } catch {
    return false
  }
}
