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
        tags: ['tag1:value1', 'tag2:value2'],
      })
    )
  })

  it('should set the ddtags', () => {
    const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {})

    expect(defaultRumEventAttributes).toEqual({
      ddtags: 'tag1:value1,tag2:value2',
    })
  })
})
