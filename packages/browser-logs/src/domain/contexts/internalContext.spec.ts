<<<<<<< HEAD
import { createSessionManagerMock } from '@datadog/browser-core/test'
=======
import { describe, expect, it } from 'vitest'
import { createLogsSessionManagerMock } from '../../../test/mockLogsSessionManager'
>>>>>>> 9f695e5f5 (✅ Migrate 257 spec files from Jasmine to Vitest API)
import { startInternalContext } from './internalContext'

describe('internal context', () => {
  it('should return undefined if session is not tracked', () => {
    const sessionManagerMock = createSessionManagerMock().setNotTracked()
    expect(startInternalContext(sessionManagerMock).get()).toEqual(undefined)
  })

  it('should return internal context corresponding to startTime', () => {
    const sessionManagerMock = createSessionManagerMock().setTracked()
    expect(startInternalContext(sessionManagerMock).get()).toEqual({
      session_id: expect.any(String),
    })
  })
})
