import { DOCS_ORIGIN, MORE_DETAILS, display } from '../../tools/display'
import type { Configuration } from './configuration'

export const TAG_SIZE_LIMIT = 200

// replaced at build time
declare const __BUILD_ENV__SDK_VERSION__: string

export function buildTags(configuration: Configuration): string[] {
  const { env, service, version, datacenter } = configuration
  const tags = [buildTag('sdk_version', __BUILD_ENV__SDK_VERSION__)]

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

export function buildTag(key: string, rawValue?: string) {
  // See https://docs.datadoghq.com/getting_started/tagging/#defining-tags for tags syntax. Note
  // that the backend may not follow the exact same rules, so we only want to display an informal
  // warning.
  const tag = rawValue ? `${key}:${rawValue}` : key

  if (tag.length > TAG_SIZE_LIMIT || hasForbiddenCharacters(tag)) {
    display.warn(
      `Tag ${tag} doesn't meet tag requirements and will be sanitized. ${MORE_DETAILS} ${DOCS_ORIGIN}/getting_started/tagging/#defining-tags`
    )
  }

  // Let the backend do most of the sanitization, but still make sure multiple tags can't be crafted
  // by forging a value containing commas.
  return sanitizeTag(tag)
}

export function sanitizeTag(tag: string) {
  return tag.replace(/,/g, '_')
}

function hasForbiddenCharacters(rawValue: string) {
  // Unicode property escapes is not supported in all browsers, so we use a try/catch.
  // Todo: Remove the try/catch when dropping support for Chrome 63 and Firefox 67
  // see: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Unicode_character_class_escape#browser_compatibility
  if (!supportUnicodePropertyEscapes()) {
    return false
  }

  // We use the Unicode property escapes to match any character that is a letter including other languages like Chinese, Japanese, etc.
  // p{Ll} matches a lowercase letter.
  // p{Lo} matches a letter that is neither uppercase nor lowercase (ex: Japanese characters).
  // See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Unicode_character_class_escape#unicode_property_escapes_vs._character_classes
  return new RegExp('[^\\p{Ll}\\p{Lo}0-9_:./-]', 'u').test(rawValue)
}

export function supportUnicodePropertyEscapes() {
  try {
    new RegExp('[\\p{Ll}]', 'u')
    return true
  } catch {
    return false
  }
}
