import { InitConfiguration } from './configuration'

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

export function buildTag(tagName: string, rawValue: string) {
  return `${tagName}:${rawValue}`
}
