import type { Configuration } from '../src/domain/configuration'
import type { SessionState } from '../src/domain/session/sessionState'
import { getExpiredSessionState } from '../src/domain/session/sessionState'

export function createFakeSessionStoreStrategy({ initialSession = {} }: { initialSession?: SessionState } = {}) {
  let session: SessionState = initialSession
  let externalChangeCallback: (() => void) | undefined

  return {
    persistSession: jasmine.createSpy('persistSession').and.callFake((newSession) => {
      session = newSession
      return Promise.resolve()
    }),

    retrieveSession: jasmine
      .createSpy<() => Promise<SessionState>>('retrieveSession')
      .and.callFake(() => Promise.resolve({ ...session })),

    expireSession: jasmine.createSpy('expireSession').and.callFake((previousSession) => {
      session = getExpiredSessionState(previousSession, { trackAnonymousUser: true } as Configuration)
      return Promise.resolve()
    }),

    onExternalChange: jasmine.createSpy('onExternalChange').and.callFake((callback: () => void) => {
      externalChangeCallback = callback
      return () => {
        externalChangeCallback = undefined
      }
    }),

    notifyExternalChange: () => {
      externalChangeCallback?.()
    },
  }
}
