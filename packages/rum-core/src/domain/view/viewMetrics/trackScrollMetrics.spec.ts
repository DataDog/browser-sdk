import type { RelativeTime, Subscription, TimeStamp } from '@datadog/browser-core'
import { DOM_EVENT, Observable } from '@datadog/browser-core'
import { createNewEvent } from '@datadog/browser-core/test'
import type { TestSetupBuilder } from '../../../../test'
import { setup } from '../../../../test'
import type { RumConfiguration } from '../../configuration'
import type { ViewTest } from '../setupViewTest.specHelper'
import { setupViewTest } from '../setupViewTest.specHelper'
import type { ScrollValues } from './trackScrollMetrics'
import { createScrollValuesObservable, trackScrollMetrics } from './trackScrollMetrics'

describe('createScrollValuesObserver', () => {
  const scrollObservable = createScrollValuesObservable({} as RumConfiguration, 0)
  let subscription: Subscription

  const newScroll = () => {
    window.dispatchEvent(createNewEvent(DOM_EVENT.SCROLL))
  }

  const increaseHeight = () => {
    const node = document.createElement('div')
    node.style.height = '2000px'
    document.body.innerHTML = ''
    document.body.appendChild(node)
  }

  afterEach(() => {
    subscription.unsubscribe()
    document.body.innerHTML = ''
  })

  it('should produce a value when scrolling', () => {
    newScroll()
    subscription = scrollObservable.subscribe(({ scrollDepth }) => {
      expect(scrollDepth).toBeGreaterThan(0)
    })
  })

  it('should produce a value when the page is resized', () => {
    increaseHeight()
    subscription = scrollObservable.subscribe(({ scrollHeight }) => {
      expect(scrollHeight).toBeGreaterThan(600)
    })
  })
})

describe('trackScrollMetrics', () => {
  let setupBuilder: TestSetupBuilder
  let viewTest: ViewTest
  let stopTrackScrollMetrics: () => void
  let callbackSpy: jasmine.Spy

  const scrollObservable = new Observable<ScrollValues>()

  beforeEach(() => {
    setupBuilder = setup()
      .withFakeLocation('/foo')
      .beforeBuild((buildContext) => {
        viewTest = setupViewTest(buildContext)
        return viewTest
      })
    callbackSpy = jasmine.createSpy('callback')
    stopTrackScrollMetrics = trackScrollMetrics(
      {} as RumConfiguration,
      { relative: 0 as RelativeTime, timeStamp: 0 as TimeStamp },
      callbackSpy,
      scrollObservable
    ).stop
  })

  afterEach(() => {
    stopTrackScrollMetrics()
    document.body.innerHTML = ''
    setupBuilder.cleanup()
  })

  it('should update scroll height and scroll depth', () => {
    scrollObservable.notify({ scrollDepth: 700, scrollHeight: 2000, scrollTop: 100 })
    expect(callbackSpy).toHaveBeenCalledOnceWith({
      maxDepth: 700,
      maxDepthScrollHeight: 2000,
      maxDepthTime: jasmine.any(Number),
      maxDepthScrollTop: 100,
    })
  })
  it('should update scroll height only if it has increased', () => {
    scrollObservable.notify({ scrollDepth: 700, scrollHeight: 2000, scrollTop: 100 })
    scrollObservable.notify({ scrollDepth: 700, scrollHeight: 1900, scrollTop: 100 })
    expect(callbackSpy).toHaveBeenCalledOnceWith({
      maxDepth: 700,
      maxDepthScrollHeight: 2000,
      maxDepthTime: jasmine.any(Number),
      maxDepthScrollTop: 100,
    })
    expect(callbackSpy).not.toHaveBeenCalledOnceWith({
      maxDepth: 700,
      maxDepthScrollHeight: 1900,
      maxDepthTime: jasmine.any(Number),
      maxDepthScrollTop: 100,
    })
  })

  it('should update max depth only if it has increased', () => {
    scrollObservable.notify({ scrollDepth: 700, scrollHeight: 2000, scrollTop: 100 })
    scrollObservable.notify({ scrollDepth: 600, scrollHeight: 2000, scrollTop: 0 })
    expect(callbackSpy).toHaveBeenCalledOnceWith({
      maxDepth: 700,
      maxDepthScrollHeight: 2000,
      maxDepthTime: jasmine.any(Number),
      maxDepthScrollTop: 100,
    })
    expect(callbackSpy).not.toHaveBeenCalledOnceWith({
      maxDepth: 600,
      maxDepthScrollHeight: 2000,
      maxDepthTime: jasmine.any(Number),
      maxDepthScrollTop: 0,
    })
  })
})
