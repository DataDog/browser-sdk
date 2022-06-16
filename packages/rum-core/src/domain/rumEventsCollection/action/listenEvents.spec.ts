import { createNewEvent } from '../../../../../core/test/specHelper'
import type { OnClickCallback } from './listenEvents'
import { listenEvents } from './listenEvents'

describe('listenEvents', () => {
  let onClickSpy: jasmine.Spy<OnClickCallback>
  let stopListenEvents: () => void

  beforeEach(() => {
    onClickSpy = jasmine.createSpy()
    ;({ stop: stopListenEvents } = listenEvents({ onClick: onClickSpy }))
  })

  afterEach(() => {
    stopListenEvents()
  })

  it('listen to click events', () => {
    emulateClick()
    expect(onClickSpy).toHaveBeenCalledOnceWith(jasmine.objectContaining({ type: 'click' }))
  })

  function emulateClick() {
    document.body.dispatchEvent(createNewEvent('mousedown'))
    document.body.dispatchEvent(createNewEvent('mouseup'))
    document.body.dispatchEvent(createNewEvent('click'))
  }
})
