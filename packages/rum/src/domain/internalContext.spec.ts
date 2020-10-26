import { setup, TestSetupBuilder } from '../../test/specHelper'
import { ParentContexts } from './parentContexts'

describe('internal context', () => {
  let setupBuilder: TestSetupBuilder
  let parentContextsStub: Partial<ParentContexts>

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
      .beforeBuild((_, configuration) => {
        configuration.isEnabled = () => false
      })
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

describe('internal context v2', () => {
  let setupBuilder: TestSetupBuilder
  let parentContextsStub: Partial<ParentContexts>

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
      .withInternalContext()
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should return current internal context', () => {
    const { internalContext } = setupBuilder.build()

    expect(internalContext.get()).toEqual({
      action: {
        id: '7890',
      },
      application: {
        id: 'appId',
      },
      session: {
        id: '1234',
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

    expect(parentContextsStub.findViewV2).toHaveBeenCalledWith(123)
    expect(parentContextsStub.findActionV2).toHaveBeenCalledWith(123)
  })
})
