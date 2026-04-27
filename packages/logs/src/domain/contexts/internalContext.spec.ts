import { describe, expect, it } from 'vitest'
import { createLogsSessionManagerMock } from '../../../test/mockLogsSessionManager'
import { startInternalContext } from './internalContext'

describe('internal context', () => {
  it('should return undefined if session is not tracked', () => {
    const sessionManagerMock = createLogsSessionManagerMock().setNotTracked()
    expect(startInternalContext(sessionManagerMock).get()).toEqual(undefined)
  })

  it('should return internal context corresponding to startTime', () => {
    const sessionManagerMock = createLogsSessionManagerMock().setTracked()
    expect(startInternalContext(sessionManagerMock).get()).toEqual({
      session_id: expect.any(String),
    })
  })
})
