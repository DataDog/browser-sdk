import type { RelativeTime } from '@datadog/js-core/time'
import { createHook } from '@datadog/js-core/assembly'
import { createRawRumEvent } from '../../../test'
import { mockSourceCodeContext } from '../../../../browser-core/test'
import type { AssembleHook, AssembleHookParams } from '../hooks'
import type { RawRumLongAnimationFrameEvent } from '../../rawRumEvent.types'
import { startSourceCodeMfeContext } from './sourceCodeMfeContext'

describe('sourceCodeContext', () => {
  let hook: AssembleHook
  // Top frame URL the context is keyed on
  const MATCHING_URL = 'http://localhost:8080/file.js'

  const TEST_STACK = `Error: Test error
    at testFunction (${MATCHING_URL}:41:27)
    at HTMLButtonElement.onclick (http://localhost:8080/file-2.js:107:146)`

  // Event stack whose top frame URL matches the registered context (deeper frames differ)
  const MATCHING_TEST_STACK = `Error: event
    at anotherFunction (${MATCHING_URL}:41:27)
    at HTMLButtonElement.onPointerUp (http://localhost:8080/file-2.js:107:146)`

  beforeEach(() => {
    hook = createHook()
  })

  it('should add source code context matching the error stack first frame URL', () => {
    mockSourceCodeContext({ [TEST_STACK]: { service: 'my-service', version: '1.0.0' } })
    startSourceCodeMfeContext(hook)

    const result = hook.trigger({
      eventType: 'error',
      startTime: 0 as RelativeTime,
      domainContext: {},
      rawRumEvent: {
        type: 'error',
        error: {
          stack: MATCHING_TEST_STACK,
        },
      },
    } as AssembleHookParams)

    expect(result).toEqual({
      type: 'error',
      service: 'my-service',
      version: '1.0.0',
    })
  })

  it('should add source code context matching the handling_stack first frame URL', () => {
    mockSourceCodeContext({ [TEST_STACK]: { service: 'my-service', version: '1.0.0' } })
    startSourceCodeMfeContext(hook)

    const result = hook.trigger({
      eventType: 'action',
      startTime: 0 as RelativeTime,
      rawRumEvent: {
        type: 'action',
      },
      domainContext: {
        handlingStack: MATCHING_TEST_STACK,
      },
    } as AssembleHookParams)

    expect(result).toEqual({
      type: 'action',
      service: 'my-service',
      version: '1.0.0',
    })
  })

  it('attributes automatic clicks using the element stack', () => {
    mockSourceCodeContext({ [TEST_STACK]: { service: 'my-service', version: '1.0.0' } })
    startSourceCodeMfeContext(hook)
    const result = hook.trigger({
      eventType: 'action',
      startTime: 0 as RelativeTime,
      rawRumEvent: createRawRumEvent('action'),
      domainContext: { events: [], elementStack: MATCHING_TEST_STACK },
    } as AssembleHookParams)
    expect(result).toEqual({ type: 'action', service: 'my-service', version: '1.0.0' })
  })

  it('does not fall through to deeper frames when the element stack first frame is unmatched', () => {
    mockSourceCodeContext({ [TEST_STACK]: { service: 'my-service', version: '1.0.0' } })
    startSourceCodeMfeContext(hook)
    const result = hook.trigger({
      eventType: 'action',
      startTime: 0 as RelativeTime,
      rawRumEvent: createRawRumEvent('action'),
      domainContext: {
        events: [],
        elementStack: `Error: element
          at closest (http://localhost:8080/unmatched.js:1:1)
          at outer (${MATCHING_URL}:41:27)`,
      },
    } as AssembleHookParams)
    expect(result).toBeUndefined()
  })

  it('does not attribute automatic clicks without an element stack', () => {
    startSourceCodeMfeContext(hook)
    expect(
      hook.trigger({
        eventType: 'action',
        startTime: 0 as RelativeTime,
        rawRumEvent: createRawRumEvent('action'),
        domainContext: { events: [] },
      } as AssembleHookParams)
    ).toBeUndefined()
  })

  it('should add source code context matching the LoAF first script source URL', () => {
    mockSourceCodeContext({ [TEST_STACK]: { service: 'my-service', version: '1.0.0' } })
    startSourceCodeMfeContext(hook)

    const result = hook.trigger({
      eventType: 'long_task',
      startTime: 0 as RelativeTime,
      domainContext: {},
      rawRumEvent: {
        type: 'long_task',
        long_task: {
          entry_type: 'long-animation-frame',
          scripts: [
            {
              source_url: 'http://localhost:8080/file.js',
            },
          ],
        },
      } as RawRumLongAnimationFrameEvent,
    })

    expect(result).toEqual({
      type: 'long_task',
      service: 'my-service',
      version: '1.0.0',
    })
  })

  it('should not add source code context matching no stack', () => {
    mockSourceCodeContext({ [TEST_STACK]: { service: 'my-service', version: '1.0.0' } })
    startSourceCodeMfeContext(hook)

    const result = hook.trigger({
      eventType: 'error',
      startTime: 0 as RelativeTime,
      domainContext: {},
      rawRumEvent: {
        type: 'error',
        error: {
          stack: `Error: Another error
                at anotherFunction (http://localhost:8080/another-file.js:41:27)`,
        },
      },
    } as AssembleHookParams)

    expect(result).toBeUndefined()
  })
})
