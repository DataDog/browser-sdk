import { createNewEvent, isIE } from '../../../../core/test/specHelper'
import { PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_INPUT_MASKED } from '../../constants'
import { initInputObserver } from './observer'
import { serializeDocument } from './serialize'
import { InputCallback } from './types'

describe('initInputObserver', () => {
  let stopInputObserver: () => void
  let inputCallbackSpy: jasmine.Spy<InputCallback>
  let sandbox: HTMLElement
  let input: HTMLInputElement

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
    inputCallbackSpy = jasmine.createSpy()
    stopInputObserver = initInputObserver(inputCallbackSpy)

    sandbox = document.createElement('div')
    input = document.createElement('input')
    sandbox.appendChild(input)
    document.body.appendChild(sandbox)

    serializeDocument(document)
  })

  afterEach(() => {
    stopInputObserver()
    sandbox.remove()
  })

  it('collects input values when an "input" event is dispatched', () => {
    dispatchInputEvent('foo')

    expect(inputCallbackSpy).toHaveBeenCalledOnceWith({
      text: 'foo',
      id: (jasmine.any(Number) as unknown) as number,
    })
  })

  it('masks input values according to the element privacy mode', () => {
    sandbox.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_INPUT_MASKED)

    dispatchInputEvent('foo')

    expect(inputCallbackSpy.calls.first().args[0].text).toBe('***')
  })

  it('masks input values according to a parent element privacy mode', () => {
    input.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_INPUT_MASKED)

    dispatchInputEvent('foo')

    expect(inputCallbackSpy.calls.first().args[0].text).toBe('***')
  })

  function dispatchInputEvent(newValue: string) {
    input.value = newValue
    input.dispatchEvent(createNewEvent('input', { target: input }))
  }
})
