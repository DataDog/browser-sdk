import { display } from '../../tools/display'
import { InitConfiguration } from './configuration'

export const TAG_SIZE_LIMIT = 200

export function buildTags(configuration: InitConfiguration): string[] {
  const { env, service, version } = configuration
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

  return tags
}

export function buildTag(key: string, rawValue: string) {
  // See https://docs.datadoghq.com/getting_started/tagging/#defining-tags for tags syntax.
  const valueSizeLimit = TAG_SIZE_LIMIT - key.length - 1
  const sanitizedValue = rawValue
    .toLowerCase()
    .slice(0, valueSizeLimit)
    .replace(/[^a-z0-9_:./-]/g, '_')

  if (sanitizedValue !== rawValue) {
    display.warn(`${key} value doesn't meet tag requirements and will be sanitized`)
  }

  return `${key}:${sanitizedValue}`
}
