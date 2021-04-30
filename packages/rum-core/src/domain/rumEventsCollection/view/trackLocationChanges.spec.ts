import { LifeCycleEventType } from '@datadog/browser-rum-core'
import { Configuration } from '@datadog/browser-core'

import { TestSetupBuilder, setup } from '../../../../test/specHelper'
import { ViewCreatedEvent, trackViews } from './trackViews'

function mockGetElementById() {
  const fakeGetElementById = (elementId: string) => ((elementId === 'testHashValue') as any) as HTMLElement
  return spyOn(document, 'getElementById').and.callFake(fakeGetElementById)
}
const configuration: Partial<Configuration> = { isEnabled: () => true }

describe('rum track location change', () => {
  let setupBuilder: TestSetupBuilder
  let initialViewId: string
  let createSpy: jasmine.Spy<(event: ViewCreatedEvent) => void>

  beforeEach(() => {
    setupBuilder = setup()
      .withFakeLocation('/foo')
      .beforeBuild(({ location, lifeCycle }) => {
        const subscription = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, ({ id }) => {
          initialViewId = id
          subscription.unsubscribe()
        })
        return trackViews(location, lifeCycle, configuration as Configuration)
      })
    createSpy = jasmine.createSpy('create')
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should create new view on path change', () => {
    const { lifeCycle } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    history.pushState({}, '', '/bar')

    expect(createSpy).toHaveBeenCalled()
    const viewContext = createSpy.calls.argsFor(0)[0]
    expect(viewContext.id).not.toEqual(initialViewId)
  })

  it('should create a new view on hash change from history', () => {
    const { lifeCycle } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    history.pushState({}, '', '/foo#bar')

    expect(createSpy).toHaveBeenCalled()
    const viewContext = createSpy.calls.argsFor(0)[0]
    expect(viewContext.id).not.toEqual(initialViewId)
  })

  it('should not create a new view on hash change from history when the hash has kept the same value', () => {
    history.pushState({}, '', '/foo#bar')

    const { lifeCycle } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    history.pushState({}, '', '/foo#bar')

    expect(createSpy).not.toHaveBeenCalled()
  })

  it('should create a new view on hash change', (done) => {
    const { lifeCycle } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    function hashchangeCallBack() {
      expect(createSpy).toHaveBeenCalled()
      const viewContext = createSpy.calls.argsFor(0)[0]
      expect(viewContext.id).not.toEqual(initialViewId)
      window.removeEventListener('hashchange', hashchangeCallBack)
      done()
    }

    window.addEventListener('hashchange', hashchangeCallBack)

    window.location.hash = '#bar'
  })

  it('should not create a new view when the hash has kept the same value', (done) => {
    history.pushState({}, '', '/foo#bar')

    const { lifeCycle } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    function hashchangeCallBack() {
      expect(createSpy).not.toHaveBeenCalled()
      window.removeEventListener('hashchange', hashchangeCallBack)
      done()
    }

    window.addEventListener('hashchange', hashchangeCallBack)

    window.location.hash = '#bar'
  })

  it('should not create a new view when it is an Anchor navigation', (done) => {
    const { lifeCycle } = setupBuilder.build()
    mockGetElementById()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    function hashchangeCallBack() {
      expect(createSpy).not.toHaveBeenCalled()
      window.removeEventListener('hashchange', hashchangeCallBack)
      done()
    }

    window.addEventListener('hashchange', hashchangeCallBack)

    window.location.hash = '#testHashValue'
  })

  it('should acknowledge the view location hash change after an Anchor navigation', (done) => {
    const { lifeCycle } = setupBuilder.build()
    const spyObj = mockGetElementById()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    function hashchangeCallBack() {
      expect(createSpy).not.toHaveBeenCalled()
      window.removeEventListener('hashchange', hashchangeCallBack)

      // clear mockGetElementById that fake Anchor nav
      spyObj.and.callThrough()

      // This is not an Anchor nav anymore but the hash and pathname have not been updated
      history.pushState({}, '', '/foo#testHashValue')
      expect(createSpy).not.toHaveBeenCalled()
      done()
    }

    window.addEventListener('hashchange', hashchangeCallBack)

    window.location.hash = '#testHashValue'
  })

  it('should not create new view on search change', () => {
    const { lifeCycle } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    history.pushState({}, '', '/foo?bar=qux')

    expect(createSpy).not.toHaveBeenCalled()
  })

  it('should not create a new view when the search part of the hash changes', () => {
    history.pushState({}, '', '/foo#bar')
    const { lifeCycle } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    history.pushState({}, '', '/foo#bar?search=1')
    history.pushState({}, '', '/foo#bar?search=2')
    history.pushState({}, '', '/foo#bar?')
    history.pushState({}, '', '/foo#bar')

    expect(createSpy).not.toHaveBeenCalled()
  })
})
