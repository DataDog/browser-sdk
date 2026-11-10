import type { ReplaySandboxSettings } from './getReplaySandboxSettings'
import { getReplaySandboxSettings } from './getReplaySandboxSettings'

const CUSTOM_SETTINGS: ReplaySandboxSettings = {
  replaySandboxSource: 'static-hash',
  replaySandboxHash: '0123456789abcdef0123456789abcdef',
  replaySandboxFeatureFlags: ['some_flag'],
}

describe('getReplaySandboxSettings', () => {
  it('applies the replay sandbox settings in Datadog employee mode', () => {
    expect(getReplaySandboxSettings({ datadogMode: true, ...CUSTOM_SETTINGS })).toEqual(CUSTOM_SETTINGS)
  })

  it('ignores the replay sandbox settings outside Datadog employee mode', () => {
    expect(getReplaySandboxSettings({ datadogMode: false, ...CUSTOM_SETTINGS })).toEqual({
      replaySandboxSource: 'prod',
      replaySandboxHash: '',
      replaySandboxFeatureFlags: [],
    })
  })
})
