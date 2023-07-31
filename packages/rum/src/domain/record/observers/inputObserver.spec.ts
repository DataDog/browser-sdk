import { DefaultPrivacyLevel, isIE } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { createNewEvent, mockClock } from '@datadog/browser-core/test'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT } from '../../../constants'
import { serializeDocument, SerializationContextStatus } from '../serialization'
import { createElementsScrollPositions } from '../elementsScrollPositions'
import type { InputCallback } from './inputObserver'
import { initInputObserver } from './inputObserver'
import { DEFAULT_CONFIGURATION, DEFAULT_SHADOW_ROOT_CONTROLLER } from './observers.specHelper'

describe('initInputObserver', () => {
  let stopInputObserver: () => void
  let inputCallbackSpy: jasmine.Spy<InputCallback>
  let sandbox: HTMLElement
  let input: HTMLInputElement
  let clock: Clock | undefined
  let configuration: RumConfiguration

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
    configuration = { defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW } as RumConfiguration
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
    clock?.cleanup()
  })

  it('collects input values when an "input" event is dispatched', () => {
    stopInputObserver = initInputObserver(configuration, inputCallbackSpy)
    dispatchInputEvent('foo')

    expect(inputCallbackSpy).toHaveBeenCalledOnceWith({
      text: 'foo',
      id: jasmine.any(Number) as unknown as number,
    })
  })

  it('collects input values when a property setter is used', () => {
    clock = mockClock()
    stopInputObserver = initInputObserver(configuration, inputCallbackSpy)
    input.value = 'foo'

    clock.tick(0)

    expect(inputCallbackSpy).toHaveBeenCalledOnceWith({
      text: 'foo',
      id: jasmine.any(Number) as unknown as number,
    })
  })

  it('does not invoke callback when the value does not change', () => {
    clock = mockClock()
    stopInputObserver = initInputObserver(configuration, inputCallbackSpy)
    input.value = 'foo'
    clock.tick(0)

    dispatchInputEvent('foo')

    expect(inputCallbackSpy).toHaveBeenCalledTimes(1)
  })

  it('does not instrument setters when observing a shadow DOM', () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set
    const host = document.createElement('div')
    host.attachShadow({ mode: 'open' })

    stopInputObserver = initInputObserver(configuration, inputCallbackSpy, host.shadowRoot!)

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set).toBe(originalSetter)
  })

  // cannot trigger an event in a Shadow DOM because event with `isTrusted:false` do not cross the root
  it('collects input values when an "input" event is composed', () => {
    stopInputObserver = initInputObserver(configuration, inputCallbackSpy)
    dispatchInputEventWithInShadowDom('foo')

    expect(inputCallbackSpy).toHaveBeenCalledOnceWith({
      text: 'foo',
      id: jasmine.any(Number) as unknown as number,
    })
  })

  it('masks input values according to the element privacy level', () => {
    configuration.defaultPrivacyLevel = DefaultPrivacyLevel.ALLOW
    stopInputObserver = initInputObserver(configuration, inputCallbackSpy)
    sandbox.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT)

    dispatchInputEvent('foo')

    expect((inputCallbackSpy.calls.first().args[0] as { text?: string }).text).toBe('***')
  })

  it('masks input values according to a parent element privacy level', () => {
    configuration.defaultPrivacyLevel = DefaultPrivacyLevel.ALLOW
    stopInputObserver = initInputObserver(configuration, inputCallbackSpy)
    input.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT)

    dispatchInputEvent('foo')

    expect((inputCallbackSpy.calls.first().args[0] as { text?: string }).text).toBe('***')
  })

  it('masks input values according to a the default privacy level', () => {
    configuration.defaultPrivacyLevel = DefaultPrivacyLevel.MASK
    stopInputObserver = initInputObserver(configuration, inputCallbackSpy)

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
