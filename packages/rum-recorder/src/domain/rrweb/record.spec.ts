import { createNewEvent } from '@datadog/browser-core'
import { record } from './record'
import { Event, EventType } from './types'

describe('record', () => {
  let input: HTMLInputElement
  let stop: (() => void) | undefined

  beforeEach(() => {
    input = document.createElement('input')
    document.body.appendChild(input)
  })

  afterEach(() => {
    input.remove()
    if (stop) {
      stop()
    }
  })

  it('will only have one full snapshot without checkout config', () => {
    const emit = jasmine.createSpy<(event: Event) => void>()
    stop = record<Event>({ emit })

    const count = 30
    for (let i = 0; i < count; i += 1) {
      input.value += 'a'
      input.dispatchEvent(createNewEvent('input', {}))
    }

    const events = emit.calls.allArgs().map(([event]) => event)
    expect(events.length).toEqual(count + 2)
    expect(events.filter((event) => event.type === EventType.Meta).length).toEqual(1)
    expect(events.filter((event) => event.type === EventType.FullSnapshot).length).toEqual(1)
  })
})
