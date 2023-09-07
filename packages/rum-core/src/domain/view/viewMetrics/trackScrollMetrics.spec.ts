import type { Duration, RelativeTime, TimeStamp } from '@datadog/browser-core'
import { DOM_EVENT } from '@datadog/browser-core'
import { collectAsyncCalls, createNewEvent } from '@datadog/browser-core/test'
import type { TestSetupBuilder } from '../../../../test'
import { setup } from '../../../../test'
import type { RumConfiguration } from '../../configuration'
import type { ViewTest } from '../setupViewTest.specHelper'
import { setupViewTest } from '../setupViewTest.specHelper'
import { trackScrollMetrics } from './trackScrollMetrics'

describe('trackScrollMetrics', () => {
  let setupBuilder: TestSetupBuilder
  let viewTest: ViewTest
  let stopTrackScrollMetrics: () => void
  let callbackSpy: jasmine.Spy
  let assertCallbackSpyEqual: (expected: any, done: DoneFn, times?: number) => void
  const getMetrics = jasmine.createSpy('getMetrics')

  const mockGetMetrics = (scrollParams: { scrollHeight: number; scrollDepth: number; scrollTop: number }) => {
    getMetrics.and.returnValue(scrollParams)
  }

  const newScroll = (scrollParams: { scrollHeight: number; scrollDepth: number; scrollTop: number }) => {
    mockGetMetrics(scrollParams)
    window.dispatchEvent(createNewEvent(DOM_EVENT.SCROLL))
  }

  const increaseHeight = (scrollParams: { scrollHeight: number; scrollDepth: number; scrollTop: number }) => {
    mockGetMetrics(scrollParams)
    const node = document.createElement('div')
    node.style.height = `${scrollParams.scrollHeight}px`
    document.body.replaceChildren(node)
  }

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
      getMetrics,
      0
    ).stop
    document.body.style.margin = '0'

    assertCallbackSpyEqual = (expected, done, times = 1) => {
      collectAsyncCalls(callbackSpy, times, (calls) => {
        expect(calls.mostRecent().args[0]).toEqual(expected)
        done()
      })
    }
  })

  afterEach(() => {
    stopTrackScrollMetrics()
    document.body.replaceChildren()
    setupBuilder.cleanup()
  })

  it('should update scroll height if resize occurred before scroll', (done) => {
    increaseHeight({ scrollDepth: 0, scrollHeight: 2000, scrollTop: 0 })
    assertCallbackSpyEqual(
      {
        maxDepthScrollHeight: 2000,
        maxDepth: 0,
        maxDepthScrollTop: 0,
        maxDepthTime: jasmine.any(Number),
      },
      done
    )
  })

  it('should update scroll depth when scrolling the first time', (done) => {
    newScroll({ scrollHeight: 1000, scrollDepth: 500, scrollTop: 100 })
    assertCallbackSpyEqual(
      {
        maxDepth: 500,
        maxDepthScrollTop: 100,
        maxDepthScrollHeight: 0,
        maxDepthTime: 0 as Duration,
      },
      done
    )
  })

  it('should update scroll depth when it has increased', (done) => {
    newScroll({ scrollHeight: 1000, scrollDepth: 500, scrollTop: 100 })
    setTimeout(() => newScroll({ scrollHeight: 1000, scrollDepth: 600, scrollTop: 200 }), 100)

    assertCallbackSpyEqual(
      {
        maxDepth: 600,
        maxDepthScrollTop: 200,
        maxDepthScrollHeight: 0,
        maxDepthTime: 0 as Duration,
      },
      done,
      2
    )
  })

  it('should update scroll depth and scroll height when both scroll and resize have occured ', (done) => {
    newScroll({ scrollHeight: 1000, scrollDepth: 600, scrollTop: 200 })
    setTimeout(() => increaseHeight({ scrollHeight: 2000, scrollDepth: 600, scrollTop: 200 }), 100)

    assertCallbackSpyEqual(
      {
        maxDepth: 600,
        maxDepthScrollTop: 200,
        maxDepthScrollHeight: 2000,
        maxDepthTime: jasmine.any(Number),
      },
      done,
      2
    )
  })
})
