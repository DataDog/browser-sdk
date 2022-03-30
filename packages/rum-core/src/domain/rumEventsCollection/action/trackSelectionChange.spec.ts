import { createNewEvent } from '../../../../../core/test/specHelper'
import { trackSelectionChange } from './trackSelectionChange'

describe('trackSelectionChange', () => {
  let getSelectionChanged: () => boolean
  let stopTrackingSelectionChange: () => void
  let input: HTMLInputElement
  let text: Text

  beforeEach(() => {
    text = document.createTextNode('foo bar')
    input = document.createElement('input')
    input.value = 'foo bar'
    document.body.appendChild(text)
    document.body.appendChild(input)
    ;({ getSelectionChanged, stop: stopTrackingSelectionChange } = trackSelectionChange())
  })

  afterEach(() => {
    stopTrackingSelectionChange()
    document.body.removeChild(text)
    document.body.removeChild(input)
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

  describe('node selection', () => {
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
  })

  describe('input selection', () => {
    it('tracks when input get selected', () => {
      emulateMouseDown()
      emulateInputSelection(0, 3)
      expect(getSelectionChanged()).toBe(true)
    })

    it('tracks when input get deselected', () => {
      emulateInputSelection(0, 3)
      emulateMouseDown()
      emulateInputSelection(0, 0)
      expect(getSelectionChanged()).toBe(true)
    })

    it('tracks when input caret is moving (selection changes and stays empty)', () => {
      emulateInputSelection(2, 2)
      emulateMouseDown()
      emulateInputSelection(0, 0)
      expect(getSelectionChanged()).toBe(true)
    })
  })

  function emulateNodeSelection(start: number, end: number) {
    const range = new Range()
    range.setStart(text, start)
    range.setEnd(text, end)
    document.getSelection()!.addRange(range)
    window.dispatchEvent(createNewEvent('selectionchange', { target: document }))
  }

  function emulateInputSelection(start: number, end: number) {
    input.focus()
    input.selectionStart = start
    input.selectionEnd = end
    window.dispatchEvent(createNewEvent('selectionchange', { target: document }))
  }

  function emulateMouseDown() {
    window.dispatchEvent(createNewEvent('mousedown', { target: document.body }))
  }
})
