import { setup, TestSetupBuilder } from '../../test/specHelper'

describe('internal context', () => {
  let setupBuilder: TestSetupBuilder
  let parentContextsStub: { findAction: jasmine.Spy; findView: jasmine.Spy }

  beforeEach(() => {
    parentContextsStub = {
      findAction: jasmine.createSpy('findAction').and.returnValue({
        userAction: {
          id: '7890',
        },
      }),
      findView: jasmine.createSpy('findView').and.returnValue({
        sessionId: '1234',
        view: {
          id: 'abcde',
          referrer: 'referrer',
          url: 'url',
        },
      }),
    }
    setupBuilder = setup()
      .withParentContexts(parentContextsStub)
      .withInternalContext()
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should return current internal context', () => {
    const { internalContext } = setupBuilder.build()

    expect(internalContext.get()).toEqual({
      application_id: 'appId',
      session_id: '1234',
      user_action: {
        id: '7890',
      },
      view: {
        id: 'abcde',
        referrer: 'referrer',
        url: 'url',
      },
    })
  })

  it("should return undefined if the session isn't tracked", () => {
    const { internalContext } = setupBuilder
      .withSession({
        getId: () => '1234',
        isTracked: () => false,
        isTrackedWithResource: () => false,
      })
      .build()

    expect(internalContext.get()).toEqual(undefined)
  })

  it('should return internal context corresponding to startTime', () => {
    const { internalContext } = setupBuilder.build()

    internalContext.get(123)

    expect(parentContextsStub.findView).toHaveBeenCalledWith(123)
    expect(parentContextsStub.findAction).toHaveBeenCalledWith(123)
  })
})
