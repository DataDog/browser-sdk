import { registerCleanupTask } from '@datadog/browser-core/test'
import { onPrerenderActivation } from './prerenderSupport'

describe('onPrerenderActivation', () => {
  let getEntriesByTypeSpy: jasmine.Spy
  let addEventListenerSpy: jasmine.Spy
  let removeEventListenerSpy: jasmine.Spy

  beforeEach(() => {
    const mockNavigationEntry = {
      activationStart: 100,
      entryType: 'navigation',
    }
    getEntriesByTypeSpy = spyOn(performance, 'getEntriesByType').and.returnValue([mockNavigationEntry] as any)
    
    addEventListenerSpy = spyOn(document, 'addEventListener')
    removeEventListenerSpy = spyOn(document, 'removeEventListener')
  })

  it('should add event listener for prerenderingchange when page is prerendered', () => {
    const callback = jasmine.createSpy('callback')

    const stop = onPrerenderActivation(callback)
    registerCleanupTask(stop)

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'prerenderingchange',
      jasmine.any(Function),
      { capture: true }
    )
  })

  it('should not listen if page is not prerendered', () => {
    const mockNavigationEntry = {
      activationStart: 0,
      entryType: 'navigation',
    }
    getEntriesByTypeSpy.and.returnValue([mockNavigationEntry] as any)

    const callback = jasmine.createSpy('callback')

    const stop = onPrerenderActivation(callback)
    
    expect(addEventListenerSpy).not.toHaveBeenCalled()
    expect(stop).toBeDefined()
    stop()
  })

  it('should stop listening when stopped', () => {
    const callback = jasmine.createSpy('callback')

    const stop = onPrerenderActivation(callback)
    stop()

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'prerenderingchange',
      jasmine.any(Function),
      { capture: true }
    )
  })
}) 