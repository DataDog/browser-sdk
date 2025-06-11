import type { Configuration } from '../configuration'
import type { AbstractHooks } from '../../tools/abstractHooks'
import { HookNames } from '../../tools/abstractHooks'

export function startTagContext(hooks: AbstractHooks, configuration: Configuration) {
  hooks.register(HookNames.Assemble, () => ({
    ddtags: configuration.tags.join(','),
  }))
}

type ContextWithTags = { ddtags?: string } | undefined

export function combineTags(a: ContextWithTags, b: ContextWithTags) {
  let ddtags = a?.ddtags

  if (b?.ddtags) {
    if (ddtags && ddtags.length > 0) {
      ddtags += `,${b.ddtags}`
    } else {
      ddtags = b.ddtags
    }
  }

  return ddtags
}
