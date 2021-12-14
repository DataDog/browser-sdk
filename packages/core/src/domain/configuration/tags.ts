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

export function buildTag(name: string, value: string) {
  value = value.toLowerCase()

  // See https://docs.datadoghq.com/getting_started/tagging/#defining-tags for tags syntax.
  const valueSizeLimit = TAG_SIZE_LIMIT - name.length - 1
  if (value.length > TAG_SIZE_LIMIT) {
    value = value.slice(0, valueSizeLimit)
    display.warn(`${name} value is too big and has been trimmed to ${value}`)
  }

  const valueWithoutForbiddenCharacters = value.replace(/[^a-z0-9_:./-]/g, '_')
  if (valueWithoutForbiddenCharacters !== value) {
    value = valueWithoutForbiddenCharacters
    display.warn(`${name} value contains forbidden characters and has been sanitized to ${value}`)
  }

  const valueWithoutEndingColon = value.replace(/:+$/, '')
  if (valueWithoutEndingColon !== value) {
    value = valueWithoutEndingColon
    display.warn(`${name} value ends with invalid characters and has been sanitized to ${value}`)
  }

  return `${name}:${value}`
}
