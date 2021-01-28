import { createNewEvent, isIE } from '@datadog/browser-core'
import { RecordType, Record } from '../../types'
import { record } from './record'

describe('record', () => {
  let input: HTMLInputElement
  let stop: (() => void) | undefined

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }

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
    const emit = jasmine.createSpy<(event: Record) => void>()
    stop = record<Record>({ emit })?.stop

    const count = 30
    for (let i = 0; i < count; i += 1) {
      input.value += 'a'
      input.dispatchEvent(createNewEvent('input', {}))
    }

    const events = emit.calls.allArgs().map(([event]) => event)
    expect(events.length).toEqual(count + 2)
    expect(events.filter((event) => event.type === RecordType.Meta).length).toEqual(1)
    expect(events.filter((event) => event.type === RecordType.FullSnapshot).length).toEqual(1)
  })
})
