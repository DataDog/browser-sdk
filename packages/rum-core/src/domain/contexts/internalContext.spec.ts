import type { RelativeTime } from '@datadog/browser-core'
import { createRumSessionManagerMock } from '../../../test/mockRumSessionManager'
import type { TestSetupBuilder } from '../../../test/specHelper'
import { setup } from '../../../test/specHelper'
import type { ActionContexts } from '../rumEventsCollection/action/actionCollection'
import type { RumSessionManager } from '../rumSessionManager'
import { startInternalContext } from './internalContext'
import type { ViewContexts } from './viewContexts'
import type { UrlContexts } from './urlContexts'

describe('internal context', () => {
  let setupBuilder: TestSetupBuilder
  let viewContextsStub: Partial<ViewContexts>
  let actionContextsStub: ActionContexts
  let findUrlSpy: jasmine.Spy<UrlContexts['findUrl']>
  let findSessionSpy: jasmine.Spy<RumSessionManager['findTrackedSession']>
  let internalContext: ReturnType<typeof startInternalContext>

  beforeEach(() => {
    viewContextsStub = {
      findView: jasmine.createSpy('findView').and.returnValue({
        id: 'abcde',
        name: 'foo',
      }),
    }
    actionContextsStub = {
      findActionId: jasmine.createSpy('findActionId').and.returnValue('7890'),
    }
    setupBuilder = setup()
      .withSessionManager(createRumSessionManagerMock().setId('456'))
      .withViewContexts(viewContextsStub)
      .withActionContexts(actionContextsStub)
      .beforeBuild(({ applicationId, sessionManager, viewContexts, urlContexts, actionContexts }) => {
        findUrlSpy = spyOn(urlContexts, 'findUrl').and.callThrough()
        findSessionSpy = spyOn(sessionManager, 'findTrackedSession').and.callThrough()
        internalContext = startInternalContext(applicationId, sessionManager, viewContexts, actionContexts, urlContexts)
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should return current internal context', () => {
    const { fakeLocation } = setupBuilder.build()

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
        url: fakeLocation.href!,
      },
    })
  })

  it("should return undefined if the session isn't tracked", () => {
    setupBuilder.withSessionManager(createRumSessionManagerMock().setNotTracked()).build()
    expect(internalContext.get()).toEqual(undefined)
  })

  it('should return internal context corresponding to startTime', () => {
    setupBuilder.build()

    internalContext.get(123)

    expect(viewContextsStub.findView).toHaveBeenCalledWith(123)
    expect(actionContextsStub.findActionId).toHaveBeenCalledWith(123 as RelativeTime)
    expect(findUrlSpy).toHaveBeenCalledWith(123 as RelativeTime)
    expect(findSessionSpy).toHaveBeenCalledWith(123 as RelativeTime)
  })
})
