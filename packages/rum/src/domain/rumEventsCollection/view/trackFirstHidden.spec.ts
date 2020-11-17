import { DOM_EVENT, restorePageVisibility, setPageVisibility } from '@datadog/browser-core'
import { resetFirstHidden, trackFirstHidden } from './trackFirstHidden'

describe('trackFirstHidden', () => {
  beforeEach(() => {
    resetFirstHidden()
  })

  afterEach(() => {
    restorePageVisibility()
  })

  it('should return Infinity if the page was not hidden yet', () => {
    expect(trackFirstHidden().timeStamp).toBe(Infinity)
  })

  it('should return 0 if the page was hidden when executing trackFirstHidden', () => {
    setPageVisibility('hidden')
    expect(trackFirstHidden().timeStamp).toBe(0)
  })

  it('should return the timestamp of the first pagehide event', () => {
    const emitter = document.createElement('div')
    const firstHidden = trackFirstHidden(emitter)

    const event = new Event(DOM_EVENT.PAGE_HIDE)
    Object.defineProperty(event, 'timeStamp', { value: 100 })
    emitter.dispatchEvent(event)

    expect(firstHidden.timeStamp).toBe(100)
  })
})
