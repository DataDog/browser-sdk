import { setup, TestSetupBuilder } from '../../test/specHelper'
import { startInternalContext } from './internalContext'
import { ParentContexts } from './parentContexts'

describe('internal context v2', () => {
  let setupBuilder: TestSetupBuilder
  let parentContextsStub: Partial<ParentContexts>
  let internalContext: ReturnType<typeof startInternalContext>

  beforeEach(() => {
    parentContextsStub = {
      findActionV2: jasmine.createSpy('findAction').and.returnValue({
        action: {
          id: '7890',
        },
      }),
      findViewV2: jasmine.createSpy('findView').and.returnValue({
        session: {
          id: '1234',
        },
        view: {
          id: 'abcde',
          referrer: 'referrer',
          url: 'url',
        },
      }),
    }
    setupBuilder = setup()
      .withParentContexts(parentContextsStub)
      .beforeBuild(({ applicationId, session, parentContexts }) => {
        internalContext = startInternalContext(applicationId, session, parentContexts)
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should return current internal context', () => {
    setupBuilder.build()

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
    setupBuilder
      .withSession({
        getId: () => '1234',
        isTracked: () => false,
        isTrackedWithResource: () => false,
      })
      .build()

    expect(internalContext.get()).toEqual(undefined)
  })

  it('should return internal context corresponding to startTime', () => {
    setupBuilder.build()

    internalContext.get(123)

    expect(parentContextsStub.findViewV2).toHaveBeenCalledWith(123)
    expect(parentContextsStub.findActionV2).toHaveBeenCalledWith(123)
  })
})
