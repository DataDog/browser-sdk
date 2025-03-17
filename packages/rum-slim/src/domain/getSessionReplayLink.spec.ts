import type { RumConfiguration } from '@flashcatcloud/browser-rum-core'
import { getSessionReplayLink } from './getSessionReplayLink'

const DEFAULT_CONFIGURATION = {
  site: 'datadoghq.com',
} as RumConfiguration

describe('getReplayLink (slim package)', () => {
  it('should return the replay link with a "slim-package" error type', () => {
    const link = getSessionReplayLink(DEFAULT_CONFIGURATION)

    expect(link).toBe('https://app.datadoghq.com/rum/replay/sessions/no-session-id?error-type=slim-package')
  })
})
