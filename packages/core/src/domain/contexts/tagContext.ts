import { buildTags } from '../configuration'
import type { Configuration } from '../configuration'
import type { AbstractHooks } from '../../tools/abstractHooks'
import { HookNames } from '../../tools/abstractHooks'

export function startTagContext(hooks: AbstractHooks, configuration: Configuration) {
  hooks.register(HookNames.Assemble, () => ({
    ddtags: buildTags(configuration),
  }))
}
