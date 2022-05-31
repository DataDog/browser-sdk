import { DefaultPrivacyLevel, isIE } from '@datadog/browser-core'
import { createNewEvent } from '../../../../core/test/specHelper'
import { NodePrivacyLevel, PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT } from '../../constants'
import type { InputCallback } from './observer'
import { initInputObserver } from './observer'
import { serializeDocument } from './serialize'

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

    sandbox = document.createElement('div')
    input = document.createElement('input')
    sandbox.appendChild(input)
    document.body.appendChild(sandbox)

    serializeDocument(document, NodePrivacyLevel.ALLOW)
  })

  afterEach(() => {
    stopInputObserver()
    sandbox.remove()
  })

  it('collects input values when an "input" event is dispatched', () => {
    stopInputObserver = initInputObserver(inputCallbackSpy, DefaultPrivacyLevel.ALLOW)
    dispatchInputEvent('foo')

    expect(inputCallbackSpy).toHaveBeenCalledOnceWith({
      text: 'foo',
      id: jasmine.any(Number) as unknown as number,
    })
  })

  it('masks input values according to the element privacy level', () => {
    stopInputObserver = initInputObserver(inputCallbackSpy, DefaultPrivacyLevel.ALLOW)
    sandbox.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT)

    dispatchInputEvent('foo')

    expect((inputCallbackSpy.calls.first().args[0] as { text?: string }).text).toBe('***')
  })

  it('masks input values according to a parent element privacy level', () => {
    stopInputObserver = initInputObserver(inputCallbackSpy, DefaultPrivacyLevel.ALLOW)
    input.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT)

    dispatchInputEvent('foo')

    expect((inputCallbackSpy.calls.first().args[0] as { text?: string }).text).toBe('***')
  })

  it('masks input values according to a the default privacy level', () => {
    stopInputObserver = initInputObserver(inputCallbackSpy, DefaultPrivacyLevel.MASK)

    dispatchInputEvent('foo')

    expect((inputCallbackSpy.calls.first().args[0] as { text?: string }).text).toBe('***')
  })

  function dispatchInputEvent(newValue: string) {
    input.value = newValue
    input.dispatchEvent(createNewEvent('input', { target: input }))
  }
})
