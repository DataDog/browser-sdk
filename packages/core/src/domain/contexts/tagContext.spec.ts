import type { Hooks } from '../../../test'
import { createHooks } from '../../../test'
import { mockRumConfiguration } from '../../../../rum-core/test'
import { HookNames } from '../../tools/abstractHooks'
import { startTagContext } from './tagContext'

describe('tag context', () => {
  let hooks: Hooks

  beforeEach(() => {
    hooks = createHooks()

    startTagContext(
      hooks,
      mockRumConfiguration({
        service: 'service',
        env: 'env',
        version: 'version',
        datacenter: 'datacenter',
      })
    )
  })

  it('should set the ddtags', () => {
    const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {})

    expect(defaultRumEventAttributes).toEqual({
      ddtags: 'sdk_version:test,env:env,service:service,version:version,datacenter:datacenter',
    })
  })
})
