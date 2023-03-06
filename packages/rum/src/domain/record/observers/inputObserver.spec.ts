import { DefaultPrivacyLevel, isIE } from '@datadog/browser-core'
import { createNewEvent } from '@datadog/browser-core/test/specHelper'
import { PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT } from '../../../constants'
import { serializeDocument, SerializationContextStatus } from '../serialize'
import { createElementsScrollPositions } from '../elementsScrollPositions'
import { DEFAULT_CONFIGURATION, DEFAULT_SHADOW_ROOT_CONTROLLER } from '../../../../test/utils'
import type { InputCallback } from './inputObserver'
import { initInputObserver } from './inputObserver'

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

    serializeDocument(document, DEFAULT_CONFIGURATION, {
      shadowRootsController: DEFAULT_SHADOW_ROOT_CONTROLLER,
      status: SerializationContextStatus.INITIAL_FULL_SNAPSHOT,
      elementsScrollPositions: createElementsScrollPositions(),
    })
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

  // cannot trigger a event in a Shadow DOM because event with `isTrusted:false` do not cross the root
  it('collects input values when an "input" event is composed', () => {
    stopInputObserver = initInputObserver(inputCallbackSpy, DefaultPrivacyLevel.ALLOW)
    dispatchInputEventWithInShadowDom('foo')

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

  function dispatchInputEventWithInShadowDom(newValue: string) {
    input.value = newValue
    const host = document.createElement('div')
    host.attachShadow({ mode: 'open' })
    const event = createNewEvent('input', { target: host, composed: true })
    event.composedPath = () => [input, host, sandbox, document.body]
    input.dispatchEvent(event)
  }
})
