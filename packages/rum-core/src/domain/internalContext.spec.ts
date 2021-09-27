import { createRumSessionMock } from 'packages/rum-core/test/mockRumSession'
import { RelativeTime } from '@datadog/browser-core'
import { setup, TestSetupBuilder } from '../../test/specHelper'
import { startInternalContext } from './internalContext'
import { ParentContexts } from './parentContexts'
import { UrlContexts } from './urlContexts'

describe('internal context', () => {
  let setupBuilder: TestSetupBuilder
  let parentContextsStub: Partial<ParentContexts>
  let findUrlSpy: jasmine.Spy<UrlContexts['findUrl']>
  let internalContext: ReturnType<typeof startInternalContext>

  beforeEach(() => {
    parentContextsStub = {
      findAction: jasmine.createSpy('findAction').and.returnValue({
        action: {
          id: '7890',
        },
      }),
      findView: jasmine.createSpy('findView').and.returnValue({
        session: {
          id: '1234',
        },
        view: {
          id: 'abcde',
        },
      }),
    }
    setupBuilder = setup()
      .withParentContexts(parentContextsStub)
      .beforeBuild(({ applicationId, session, parentContexts, urlContexts }) => {
        findUrlSpy = spyOn(urlContexts, 'findUrl').and.callThrough()
        internalContext = startInternalContext(applicationId, session, parentContexts, urlContexts)
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should return current internal context', () => {
    const { fakeLocation } = setupBuilder.build()

    expect(internalContext.get()).toEqual({
      application_id: 'appId',
      session_id: '1234',
      user_action: {
        id: '7890',
      },
      view: {
        id: 'abcde',
        referrer: document.referrer,
        url: fakeLocation.href!,
      },
    })
  })

  it("should return undefined if the session isn't tracked", () => {
    setupBuilder.withSession(createRumSessionMock().setNotTracked()).build()
    expect(internalContext.get()).toEqual(undefined)
  })

  it('should return internal context corresponding to startTime', () => {
    setupBuilder.build()

    internalContext.get(123)

    expect(parentContextsStub.findView).toHaveBeenCalledWith(123)
    expect(parentContextsStub.findAction).toHaveBeenCalledWith(123)
    expect(findUrlSpy).toHaveBeenCalledWith(123 as RelativeTime)
  })
})
