import { DefaultPrivacyLevel, noop } from '@datadog/browser-core'
import { createNewEvent, registerCleanupTask } from '@datadog/browser-core/test'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT } from '@datadog/browser-rum-core'
import type { BrowserChangeRecord, BrowserRecord } from '../../../types'
import { ChangeType, InputSelectionState } from '../../../types'
import type { NodeId } from '../itemIds'
import type { RecordingScope } from '../recordingScope'
import type { ChangeDecoder, SerializationStats } from '../serialization'
import { serializeHtml } from '../test/serializeHtml.specHelper'
import { trackInput } from './trackInput'

describe('trackInput', () => {
  describe('<input type="text">', () => {
    it('records the value when an "input" event is dispatched', async () => {
      const { changes, nodeIdOf, sandbox } = await recordInputIn(
        '<input type="text" />',
        (input: HTMLElement) => {
          input.dispatchEvent(createNewEvent('input', { target: input }))
        },
        { beforeTracking: (input: HTMLElement) => setValue(input, 'foo') }
      )

      expect(changes.length).toBe(1)
      expect(changes[0].data).toEqual([[ChangeType.InputValue, [nodeIdOf(sandbox), 'foo']]])
    })

    it('records the value when the value property is set', async () => {
      const { changes, nodeIdOf, sandbox } = await recordInputIn('<input type="text" />', (input: HTMLElement) => {
        setValue(input, 'foo')
      })

      expect(changes.length).toBe(1)
      expect(changes[0].data).toEqual([[ChangeType.InputValue, [nodeIdOf(sandbox), 'foo']]])
    })

    it('does not record the value a second time when it has not changed', async () => {
      const { changes, nodeIdOf, sandbox } = await recordInputIn(
        '<input type="text" />',
        async (input: HTMLElement) => {
          await actAndWaitForInstrumentation(() => {
            setValue(input, 'foo')
          })

          input.dispatchEvent(createNewEvent('input', { target: input }))
        }
      )

      expect(changes.length).toBe(1)
      expect(changes[0].data).toEqual([[ChangeType.InputValue, [nodeIdOf(sandbox), 'foo']]])
    })

    // An event cannot be dispatched from inside a shadow root directly, because events with
    // `isTrusted: false` do not cross the shadow root boundary.
    it('records a composed event against the element it was composed from', async () => {
      const { changes, nodeIdOf, sandbox } = await recordInputIn(
        '<input type="text" />',
        (input: HTMLElement) => {
          const document = input.ownerDocument
          const host = document.createElement('div')
          host.attachShadow({ mode: 'open' })

          const event = createNewEvent('input', { target: host, composed: true })
          event.composedPath = () => [input, host, document.body]
          input.dispatchEvent(event)
        },
        { beforeTracking: (input: HTMLElement) => setValue(input, 'foo') }
      )

      expect(changes.length).toBe(1)
      expect(changes[0].data).toEqual([[ChangeType.InputValue, [nodeIdOf(sandbox), 'foo']]])
    })
  })

  describe('<textarea>', () => {
    it('records the value when an "input" event is dispatched', async () => {
      const { changes, nodeIdOf, sandbox } = await recordInputIn(
        '<textarea></textarea>',
        (textarea: HTMLElement) => {
          textarea.dispatchEvent(createNewEvent('input', { target: textarea }))
        },
        { beforeTracking: (textarea: HTMLElement) => setValue(textarea, 'several lines') }
      )

      expect(changes.length).toBe(1)
      expect(changes[0].data).toEqual([[ChangeType.InputValue, [nodeIdOf(sandbox), 'several lines']]])
    })
  })

  describe('<select>', () => {
    const TWO_OPTIONS = '<select><option value="a">a</option><option value="b">b</option></select>'

    it('records the selected <option>, not the <select>', async () => {
      const { changes, nodeIdOf, sandbox } = await recordInputIn(
        TWO_OPTIONS,
        (select: HTMLElement) => {
          select.dispatchEvent(createNewEvent('change', { target: select }))
        },
        { beforeTracking: (select: HTMLElement) => setValue(select, 'b') }
      )

      const [, b] = Array.from(sandbox.querySelectorAll('option'))
      expect(changes.length).toBe(1)
      expect(changes[0].data).toEqual([[ChangeType.InputSelection, [InputSelectionState.Selected, nodeIdOf(b)]]])
    })

    it('does not record the previously selected <option> being deselected', async () => {
      const { changes, nodeIdOf, sandbox } = await recordInputIn(TWO_OPTIONS, async (select: HTMLElement) => {
        await actAndWaitForInstrumentation(() => {
          setValue(select, 'b')
          select.dispatchEvent(createNewEvent('change', { target: select }))
        })

        setValue(select, 'a')
        select.dispatchEvent(createNewEvent('change', { target: select }))
      })

      // Selecting an <option> implicitly deselects the one selected before it, so each change
      // records the newly selected <option> and nothing else.
      const [a, b] = Array.from(sandbox.querySelectorAll('option'))
      expect(changes.length).toBe(2)
      expect(changes[0].data).toEqual([[ChangeType.InputSelection, [InputSelectionState.Selected, nodeIdOf(b)]]])
      expect(changes[1].data).toEqual([[ChangeType.InputSelection, [InputSelectionState.Selected, nodeIdOf(a)]]])
    })

    it('records an <option> being selected again after another one was selected', async () => {
      const { changes, nodeIdOf, sandbox } = await recordInputIn(TWO_OPTIONS, async (select: HTMLElement) => {
        for (const value of ['b', 'a', 'b']) {
          await actAndWaitForInstrumentation(() => {
            setValue(select, value)
            select.dispatchEvent(createNewEvent('change', { target: select }))
          })
        }
      })

      const [, b] = Array.from(sandbox.querySelectorAll('option'))
      expect(changes.length).toBe(3)
      expect(changes[2].data).toEqual([[ChangeType.InputSelection, [InputSelectionState.Selected, nodeIdOf(b)]]])
    })

    it('does not record the same <option> being selected twice', async () => {
      const { changes } = await recordInputIn(TWO_OPTIONS, async (select: HTMLElement) => {
        await actAndWaitForInstrumentation(() => {
          setValue(select, 'b')
          select.dispatchEvent(createNewEvent('change', { target: select }))
        })

        select.dispatchEvent(createNewEvent('change', { target: select }))
      })

      expect(changes.length).toBe(1)
    })
  })

  describe('<input type="checkbox">', () => {
    it('records the checkbox becoming selected', async () => {
      const { changes, nodeIdOf, sandbox } = await recordInputIn(
        '<input type="checkbox" />',
        (checkbox: HTMLElement) => {
          checkbox.dispatchEvent(createNewEvent('change', { target: checkbox }))
        },
        { beforeTracking: (checkbox: HTMLElement) => setChecked(checkbox, true) }
      )

      expect(changes.length).toBe(1)
      expect(changes[0].data).toEqual([[ChangeType.InputSelection, [InputSelectionState.Selected, nodeIdOf(sandbox)]]])
    })

    it('records the checkbox becoming deselected', async () => {
      const { changes, nodeIdOf, sandbox } = await recordInputIn(
        '<input type="checkbox" checked />',
        (checkbox: HTMLElement) => {
          checkbox.dispatchEvent(createNewEvent('change', { target: checkbox }))
        },
        { beforeTracking: (checkbox: HTMLElement) => setChecked(checkbox, false) }
      )

      expect(changes.length).toBe(1)
      expect(changes[0].data).toEqual([
        [ChangeType.InputSelection, [InputSelectionState.Deselected, nodeIdOf(sandbox)]],
      ])
    })

    it('records the selection state when the checked property is set', async () => {
      const { changes, nodeIdOf, sandbox } = await recordInputIn(
        '<input type="checkbox" />',
        (checkbox: HTMLElement) => {
          setChecked(checkbox, true)
        }
      )

      expect(changes.length).toBe(1)
      expect(changes[0].data).toEqual([[ChangeType.InputSelection, [InputSelectionState.Selected, nodeIdOf(sandbox)]]])
    })
  })

  describe('<input type="radio">', () => {
    it('records the rest of the group being deselected alongside the selected button', async () => {
      const { changes, nodeIdOf, sandbox } = await recordInputIn(
        `<div>
          <input type="radio" name="group" checked />
          <input type="radio" name="group" />
          <input type="radio" name="group" />
        </div>`,
        (container: HTMLElement) => {
          const [, second] = Array.from(container.querySelectorAll('input'))
          second.dispatchEvent(createNewEvent('change', { target: second }))
        },
        {
          // Checking a radio button is what a browser does to the group before it dispatches the
          // 'change' event on the button that the user selected.
          beforeTracking: (container: HTMLElement) => {
            const [first, second] = Array.from(container.querySelectorAll('input'))
            first.checked = false
            second.checked = true
          },
        }
      )

      // The whole group changes to the same state, so it is recorded as a single change that
      // applies that state to every node in it.
      const [first, second, third] = Array.from(sandbox.querySelectorAll('input'))
      expect(changes.length).toBe(1)
      expect(changes[0].data).toEqual([
        [
          ChangeType.InputSelection,
          [InputSelectionState.Selected, nodeIdOf(second)],
          [InputSelectionState.Deselected, nodeIdOf(first), nodeIdOf(third)],
        ],
      ])
    })
  })

  describe('privacy', () => {
    it('masks the value according to the privacy level of the element', async () => {
      const { changes, nodeIdOf, sandbox } = await recordInputIn(
        `<input type="text" ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK_USER_INPUT}" />`,
        (input: HTMLElement) => {
          input.dispatchEvent(createNewEvent('input', { target: input }))
        },
        { beforeTracking: (input: HTMLElement) => setValue(input, 'foo') }
      )

      expect(changes.length).toBe(1)
      expect(changes[0].data).toEqual([[ChangeType.InputValue, [nodeIdOf(sandbox), '***']]])
    })

    it('masks the value according to the privacy level of an ancestor', async () => {
      const { changes, nodeIdOf, sandbox } = await recordInputIn(
        `<div ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK_USER_INPUT}"><input type="text" /></div>`,
        (container: HTMLElement) => {
          const input = container.querySelector('input')!
          input.dispatchEvent(createNewEvent('input', { target: input }))
        },
        { beforeTracking: (container: HTMLElement) => setValue(container.querySelector('input')!, 'foo') }
      )

      expect(changes.length).toBe(1)
      expect(changes[0].data).toEqual([[ChangeType.InputValue, [nodeIdOf(sandbox.querySelector('input')!), '***']]])
    })

    it('masks the value according to the default privacy level', async () => {
      const { changes, nodeIdOf, sandbox } = await recordInputIn(
        '<input type="text" />',
        (input: HTMLElement) => {
          input.dispatchEvent(createNewEvent('input', { target: input }))
        },
        {
          beforeTracking: (input: HTMLElement) => setValue(input, 'foo'),
          configuration: { defaultPrivacyLevel: DefaultPrivacyLevel.MASK },
        }
      )

      expect(changes.length).toBe(1)
      expect(changes[0].data).toEqual([[ChangeType.InputValue, [nodeIdOf(sandbox), '***']]])
    })

    it('records nothing at all for a masked <select>', async () => {
      // A selection state has nothing that can stand in for the selected <option> the way '***'
      // stands in for a value, so a masked <select> records nothing rather than giving away
      // which option was picked.
      const { changes, emitStats } = await recordInputIn(
        '<select><option value="a">a</option><option value="b">b</option></select>',
        (select: HTMLElement) => {
          select.dispatchEvent(createNewEvent('change', { target: select }))
        },
        {
          beforeTracking: (select: HTMLElement) => setValue(select, 'b'),
          configuration: { defaultPrivacyLevel: DefaultPrivacyLevel.MASK },
        }
      )

      expect(changes).toEqual([])
      expect(emitStats).not.toHaveBeenCalled()
    })

    it('records nothing at all for a masked checkbox', async () => {
      const { changes, emitStats } = await recordInputIn(
        '<input type="checkbox" />',
        (checkbox: HTMLElement) => {
          checkbox.dispatchEvent(createNewEvent('change', { target: checkbox }))
        },
        {
          beforeTracking: (checkbox: HTMLElement) => setChecked(checkbox, true),
          configuration: { defaultPrivacyLevel: DefaultPrivacyLevel.MASK },
        }
      )

      expect(changes).toEqual([])
      expect(emitStats).not.toHaveBeenCalled()
    })
  })

  describe('when tracking a shadow root', () => {
    it('does not instrument property setters', async () => {
      const { sandbox, scope } = await createSandbox('<div></div>')
      const view = sandbox.ownerDocument.defaultView!
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const originalSetter = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'value')!.set

      const inputTracker = trackInput(sandbox.attachShadow({ mode: 'open' }), noop, noop, scope)
      registerCleanupTask(() => {
        inputTracker.stop()
      })

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'value')!.set).toBe(originalSetter)
    })
  })
})

/**
 * Serializes the given HTML in an isolated iframe, so that the elements under test have node
 * ids, and returns the sandbox along with the state needed to track input in it. The sandbox
 * is the outermost element of the HTML.
 */
async function createSandbox(
  html: string,
  configuration?: Partial<RumConfiguration>
): Promise<{ sandbox: HTMLElement; scope: RecordingScope; decoder: ChangeDecoder }> {
  let captured: { sandbox: HTMLElement; scope: RecordingScope; decoder: ChangeDecoder } | undefined

  const fullSnapshot = await serializeHtml(html, {
    configuration,
    after(target: Node, scope: RecordingScope, _stats: SerializationStats, decoder: ChangeDecoder): void {
      captured = { sandbox: target as HTMLElement, scope, decoder }
    },
  })

  if (!fullSnapshot || !captured) {
    throw new Error('Expected a full snapshot to be recorded')
  }
  return captured
}

/**
 * Serializes the given HTML in an isolated iframe, tracks input in it, and runs `interaction`
 * against the sandbox. Returns the change records that were recorded, decoded in the order
 * they were emitted, and the spy standing in for the stats callback.
 *
 * Use the `beforeTracking` option to put the sandbox into the state a browser would have put
 * it in before it dispatched the event under test. Assigning to a property inside
 * `interaction` instead would go through the instrumented property setters, which record a
 * change of their own and would mask whatever the event listener does or doesn't record.
 */
async function recordInputIn(
  html: string,
  interaction: (sandbox: HTMLElement) => void | Promise<void>,
  {
    beforeTracking,
    configuration,
  }: {
    beforeTracking?: (sandbox: HTMLElement) => void
    configuration?: Partial<RumConfiguration>
  } = {}
): Promise<{
  changes: BrowserChangeRecord[]
  nodeIdOf: (node: Node) => NodeId
  sandbox: HTMLElement
  emitStats: jasmine.Spy
}> {
  const { sandbox, scope, decoder } = await createSandbox(html, configuration)

  beforeTracking?.(sandbox)

  const changes: BrowserChangeRecord[] = []
  const emitRecord = (record: BrowserRecord): void => {
    changes.push(decoder.decode(record as BrowserChangeRecord))
  }
  const emitStats = jasmine.createSpy('emitStats')

  const inputTracker = trackInput(sandbox.ownerDocument, emitRecord, emitStats, scope)
  registerCleanupTask(() => {
    inputTracker.stop()
  })

  await actAndWaitForInstrumentation(() => interaction(sandbox))

  return {
    changes,
    nodeIdOf: (node: Node) => nodeIdOf(node, scope),
    sandbox,
    emitStats,
  }
}

function nodeIdOf(node: Node, scope: RecordingScope): NodeId {
  const nodeId = scope.nodeIds.get(node)
  if (nodeId === undefined) {
    throw new Error('Node was not serialized')
  }
  return nodeId
}

function setValue(element: HTMLElement, value: string) {
  ;(element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value = value
}

function setChecked(element: HTMLElement, checked: boolean) {
  ;(element as HTMLInputElement).checked = checked
}

async function actAndWaitForInstrumentation(action: () => Promise<void> | void): Promise<void> {
  await action()

  // `instrumentSetter()` runs instrumentation at the next macrotask. Wait until the
  // instrumentation has run.
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}
