import { Batch } from '../../core/transport'
import { isIE } from '../../tests/specHelper'
import { pageViewId, trackPageView } from '../pageViewTracker'
import { RumEvent } from '../rum'

describe('rum track url change', () => {
  let fakeLocation: Partial<Location>
  let initialPageViewId: string

  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }
    spyOn(history, 'pushState').and.callFake((_: any, __: string, pathname: string) => {
      const url = new URL(pathname, 'http://localhost')
      fakeLocation.pathname = url.pathname
      fakeLocation.search = url.search
      fakeLocation.hash = url.hash
    })
    fakeLocation = { pathname: '/foo' }
    const fakeBatch: Partial<Batch<RumEvent>> = { beforeFlushOnUnload: () => undefined }
    trackPageView(fakeBatch as Batch<RumEvent>, fakeLocation as Location, () => undefined)
    initialPageViewId = pageViewId
  })

  it('should update page view id on path change', () => {
    history.pushState({}, '', '/bar')

    expect(pageViewId).not.toEqual(initialPageViewId)
  })

  it('should not update page view id on search change', () => {
    history.pushState({}, '', '/foo?bar=qux')

    expect(pageViewId).toEqual(initialPageViewId)
  })

  it('should not update page view id on hash change', () => {
    history.pushState({}, '', '/foo#bar')

    expect(pageViewId).toEqual(initialPageViewId)
  })
})
