import { createNewEvent } from '../../../../../core/test/specHelper'
import { trackSelectionChange } from './trackSelectionChange'

describe('trackSelectionChange', () => {
  let getSelectionChanged: () => boolean
  let stopTrackingSelectionChange: () => void
  let text: Text

  beforeEach(() => {
    text = document.createTextNode('foo bar')
    document.body.appendChild(text)
    ;({ getSelectionChanged, stop: stopTrackingSelectionChange } = trackSelectionChange())
  })

  afterEach(() => {
    stopTrackingSelectionChange()
    document.body.removeChild(text)
    document.getSelection()!.removeAllRanges()
  })

  it("doesn't have selection change at start", () => {
    expect(getSelectionChanged()).toBe(false)
  })

  it('resets its state every time the mouse is pressed', () => {
    emulateMouseDown()
    emulateNodeSelection(0, 3)
    expect(getSelectionChanged()).toBe(true)
    emulateMouseDown()
    expect(getSelectionChanged()).toBe(false)
  })

  it('tracks when nodes get selected', () => {
    emulateMouseDown()
    emulateNodeSelection(0, 3)
    expect(getSelectionChanged()).toBe(true)
  })

  it('tracks when nodes get deselected', () => {
    emulateNodeSelection(0, 3)
    emulateMouseDown()
    emulateNodeSelection(0, 0)
    expect(getSelectionChanged()).toBe(true)
  })

  it('does not track when the selection changes but stays empty', () => {
    emulateMouseDown()
    emulateNodeSelection(0, 0)
    expect(getSelectionChanged()).toBe(false)
  })

  function emulateNodeSelection(start: number, end: number) {
    const range = new Range()
    range.setStart(text, start)
    range.setEnd(text, end)
    document.getSelection()!.addRange(range)
    window.dispatchEvent(createNewEvent('selectionchange', { target: document }))
  }

  function emulateMouseDown() {
    window.dispatchEvent(createNewEvent('mousedown', { target: document.body }))
  }
})
