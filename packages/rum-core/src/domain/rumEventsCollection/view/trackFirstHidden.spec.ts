import { DOM_EVENT, RelativeTime } from '@datadog/browser-core'
import { createNewEvent, restorePageVisibility, setPageVisibility } from '../../../../../core/test/specHelper'
import { resetFirstHidden, trackFirstHidden } from './trackFirstHidden'

describe('trackFirstHidden', () => {
  afterEach(() => {
    resetFirstHidden()
    restorePageVisibility()
  })

  it('should return Infinity if the page was not hidden yet', () => {
    expect(trackFirstHidden().timeStamp).toBe(Infinity as RelativeTime)
  })

  it('should return 0 if the page was hidden when executing trackFirstHidden', () => {
    setPageVisibility('hidden')
    expect(trackFirstHidden().timeStamp).toBe(0 as RelativeTime)
  })

  it('should stay to 0 if the page was hidden when executing trackFirstHidden and a pagehide occurs', () => {
    setPageVisibility('hidden')
    const emitter = document.createElement('div')
    const firstHidden = trackFirstHidden(emitter)

    emitter.dispatchEvent(createNewEvent(DOM_EVENT.PAGE_HIDE, { timeStamp: 100 }))

    expect(firstHidden.timeStamp).toBe(0 as RelativeTime)
  })

  it('should return the timestamp of the first pagehide event', () => {
    const emitter = document.createElement('div')
    const firstHidden = trackFirstHidden(emitter)

    emitter.dispatchEvent(createNewEvent(DOM_EVENT.PAGE_HIDE, { timeStamp: 100 }))

    expect(firstHidden.timeStamp).toBe(100 as RelativeTime)
  })

  it('should stay to the first value if multiple pagehide event occurs', () => {
    const emitter = document.createElement('div')
    const firstHidden = trackFirstHidden(emitter)

    emitter.dispatchEvent(createNewEvent(DOM_EVENT.PAGE_HIDE, { timeStamp: 100 }))
    emitter.dispatchEvent(createNewEvent(DOM_EVENT.PAGE_HIDE, { timeStamp: 200 }))

    expect(firstHidden.timeStamp).toBe(100 as RelativeTime)
  })
})
