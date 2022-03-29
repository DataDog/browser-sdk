import { display } from '../../tools/display'
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

const FORBIDDEN_CHARACTERS = /[^a-z0-9_:./-]/

export function buildTag(key: string, rawValue: string) {
  // See https://docs.datadoghq.com/getting_started/tagging/#defining-tags for tags syntax. Note
  // that the backend may not follow the exact same rules, so we only want to display an informal
  // warning.
  const valueSizeLimit = TAG_SIZE_LIMIT - key.length - 1

  if (rawValue.length > valueSizeLimit || FORBIDDEN_CHARACTERS.test(rawValue)) {
    display.warn(`${key} value doesn't meet tag requirements and will be sanitized`)
  }

  // Let the backend do most of the sanitization, but still make sure multiple tags can't be crafted
  // by forging a value containing commas.
  const sanitizedValue = rawValue.replace(/,/g, '_')

  return `${key}:${sanitizedValue}`
}
