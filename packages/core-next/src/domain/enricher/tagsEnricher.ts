import type { Enricher } from './factory'

interface TagsData {
  service?: string
  ddtags: string
}

interface TagsEnricherOptions {
  env?: string
  service?: string
  version?: string
  sdkVersion?: string
}

/**
 * Adds `service` and `ddtags` to events.
 *
 * Must be registered AFTER `internalContextEnricher` so that `_dd.browser_sdk_version`
 * is available for the `sdk_version` tag.
 *
 * Tags follow the format `key:value`, comma-separated:
 * `sdk_version:1.0.0,env:production,service:my-app,version:2.3.1`
 */
function tagsEnricher(
  options: TagsEnricherOptions
): Enricher<Record<string, unknown>, Record<string, unknown> & TagsData> {
  return {
    name: 'tags',
    transform(data) {
      const tags: string[] = []

      const sdkVersion = options.sdkVersion ?? (data._dd as Record<string, unknown> | undefined)?.browser_sdk_version
      if (sdkVersion) {
        tags.push(`sdk_version:${sanitizeTag(String(sdkVersion))}`)
      }
      if (options.env) {
        tags.push(`env:${sanitizeTag(options.env)}`)
      }
      if (options.service) {
        tags.push(`service:${sanitizeTag(options.service)}`)
      }
      if (options.version) {
        tags.push(`version:${sanitizeTag(options.version)}`)
      }

      return {
        ...data,
        ...(options.service && { service: options.service }),
        ddtags: tags.join(','),
      }
    },
  }
}

function sanitizeTag(value: string): string {
  return value.replace(/,/g, '_')
}

export { tagsEnricher, sanitizeTag }
export type { TagsData, TagsEnricherOptions }
