import { buildTags, type Configuration } from '../configuration'
import type { AbstractHooks } from '../../tools/abstractHooks'
import { HookNames } from '../../tools/abstractHooks'

export function startTagContext(hooks: AbstractHooks, configuration: Configuration) {
  hooks.register(HookNames.Assemble, () => ({
    ddtags: buildTags(configuration).join(','),
  }))
}

type ContextWithTags = { ddtags?: string } | undefined

export function combineTags(a: ContextWithTags, b: ContextWithTags) {
  const tagsA = a?.ddtags
  const tagsB = b?.ddtags
  return tagsA && tagsB ? `${tagsA},${tagsB}` : tagsA || tagsB
}
