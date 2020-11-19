import { createNewEvent, DOM_EVENT, restorePageVisibility, setPageVisibility } from '@datadog/browser-core'
import { resetFirstHidden, trackFirstHidden } from './trackFirstHidden'

describe('trackFirstHidden', () => {
  afterEach(() => {
    resetFirstHidden()
    restorePageVisibility()
  })

  it('should return Infinity if the page was not hidden yet', () => {
    expect(trackFirstHidden().timeStamp).toBe(Infinity)
  })

  it('should return 0 if the page was hidden when executing trackFirstHidden', () => {
    setPageVisibility('hidden')
    expect(trackFirstHidden().timeStamp).toBe(0)
  })

  it('should stay to 0 if the page was hidden when executing trackFirstHidden and a pagehide occurs', () => {
    setPageVisibility('hidden')
    const emitter = document.createElement('div')
    const firstHidden = trackFirstHidden(emitter)

    dispatchPageHideEvent(emitter, 100)

    expect(firstHidden.timeStamp).toBe(0)
  })

  it('should return the timestamp of the first pagehide event', () => {
    const emitter = document.createElement('div')
    const firstHidden = trackFirstHidden(emitter)

    dispatchPageHideEvent(emitter, 100)

    expect(firstHidden.timeStamp).toBe(100)
  })

  it('should stay to the first value if multiple pagehide event occurs', () => {
    const emitter = document.createElement('div')
    const firstHidden = trackFirstHidden(emitter)

    dispatchPageHideEvent(emitter, 100)
    dispatchPageHideEvent(emitter, 200)

    expect(firstHidden.timeStamp).toBe(100)
  })

  function dispatchPageHideEvent(emitter: Node, timeStamp: number) {
    const event = createNewEvent(DOM_EVENT.PAGE_HIDE)
    Object.defineProperty(event, 'timeStamp', {
      get() {
        return timeStamp
      },
    })
    emitter.dispatchEvent(event)
  }
})
