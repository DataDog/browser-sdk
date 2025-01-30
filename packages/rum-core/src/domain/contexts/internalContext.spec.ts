import { noop, type RelativeTime } from '@datadog/browser-core'
import { buildLocation } from '@datadog/browser-core/test'
import { createRumSessionManagerMock } from '../../../test'
import type { ActionContexts } from '../action/actionCollection'
import type { RumSessionManager } from '../rumSessionManager'
import { startInternalContext } from './internalContext'
import type { ViewHistory } from './viewHistory'
import type { UrlContexts } from './urlContexts'

describe('internal context', () => {
  let findUrlSpy: jasmine.Spy<UrlContexts['findUrl']>
  let findSessionSpy: jasmine.Spy<RumSessionManager['findTrackedSession']>
  let fakeLocation: Location
  let viewHistory: ViewHistory
  let actionContexts: ActionContexts

  function setupInternalContext(sessionManager: RumSessionManager) {
    viewHistory = {
      findView: jasmine.createSpy('findView').and.returnValue({
        id: 'abcde',
        name: 'foo',
      }),
      getAllEntries: () => [],
      stop: noop,
    }

    actionContexts = {
      findActionId: jasmine.createSpy('findActionId').and.returnValue('7890'),
    }

    fakeLocation = buildLocation('/foo')

    const urlContexts: UrlContexts = {
      findUrl: () => ({
        url: fakeLocation.href,
        referrer: document.referrer,
      }),
      stop: noop,
    }
    findSessionSpy = spyOn(sessionManager, 'findTrackedSession').and.callThrough()
    findUrlSpy = spyOn(urlContexts, 'findUrl').and.callThrough()

    return startInternalContext('appId', sessionManager, viewHistory, actionContexts, urlContexts)
  }

  it('should return current internal context', () => {
    const sessionManager = createRumSessionManagerMock().setId('456')
    const internalContext = setupInternalContext(sessionManager)

    expect(internalContext.get()).toEqual({
      application_id: 'appId',
      session_id: '456',
      user_action: {
        id: '7890',
      },
      view: {
        id: 'abcde',
        name: 'foo',
        referrer: document.referrer,
        url: fakeLocation.href,
      },
    })
  })

  it("should return undefined if the session isn't tracked", () => {
    const sessionManager = createRumSessionManagerMock().setNotTracked()
    const internalContext = setupInternalContext(sessionManager)
    expect(internalContext.get()).toEqual(undefined)
  })

  it('should return internal context corresponding to startTime', () => {
    const sessionManager = createRumSessionManagerMock().setId('456')
    const internalContext = setupInternalContext(sessionManager)

    internalContext.get(123)

    expect(viewHistory.findView).toHaveBeenCalledWith(123 as RelativeTime)
    expect(actionContexts.findActionId).toHaveBeenCalledWith(123 as RelativeTime)
    expect(findUrlSpy).toHaveBeenCalledWith(123 as RelativeTime)
    expect(findSessionSpy).toHaveBeenCalledWith(123 as RelativeTime)
  })
})
