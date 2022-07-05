import { startInternalContext } from './internalContext'

describe('internal context', () => {
  it('should return undefined if sessionManager cannot find session', () => {
    const sessionManagerMock = {
      findTrackedSession: () => undefined,
    }
    expect(startInternalContext(sessionManagerMock).get()).toEqual(undefined)
  })

  it('should return internal context corresponding to startTime', () => {
    const sessionIdMock = '123'
    const sessionManagerMock = {
      findTrackedSession: () => ({
        id: sessionIdMock,
      }),
    }
    expect(startInternalContext(sessionManagerMock).get()).toEqual({
      session_id: sessionIdMock,
    })
  })
})
