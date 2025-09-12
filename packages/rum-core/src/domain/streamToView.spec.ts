import type { Context } from '@datadog/browser-core'
import { RumEventType } from '../rawRumEvent.types'
import type { RumEvent, RumViewEvent } from '../rumEvent.types'
import { mapStreamToView } from './streamToView'

describe('mapStreamToView', () => {
  it('maps stream to view correctly', () => {
    const input = {
      type: RumEventType.STREAM,
      stream: {
        id: 'stream-id-456',
        document_version: 25,
        time_spent: 3_000_000_000,
      },
      view: { id: 'original-view-id', url: '/test-page' },
      _dd: { replay: true },
      context: { foo: 'bar' },
    } as unknown as RumEvent & Context

    const out = mapStreamToView(input) as unknown as RumViewEvent & Context

    expect(out.type).toBe(RumEventType.VIEW)
    expect(out._dd.document_version).toBe(25)
    expect(out.view.id).toBe('stream-id-456')
    expect(out.view.time_spent).toBe(3_000_000_000)
    expect(out.stream!.time_spent).toBeUndefined()
    expect(out.view.action.count).toBe(0)
    expect(out.view.error.count).toBe(0)
    expect(out.view.resource.count).toBe(0)
  })

  it('does not mutate the input', () => {
    const input = {
      type: RumEventType.STREAM,
      stream: { id: 'x', document_version: 1, time_spent: 1 },
      view: { id: 'y' },
    } as unknown as RumEvent & Context
    const snapshot = JSON.parse(JSON.stringify(input))

    mapStreamToView(input)

    expect(input).toEqual(snapshot)
  })

  it('handles missing fields gracefully', () => {
    const out = mapStreamToView({
      type: RumEventType.STREAM,
      stream: { id: 'only-id' },
      view: {},
    } as unknown as RumEvent & Context) as RumViewEvent

    expect(out.view.id).toBe('only-id')
    expect(out._dd?.document_version).toBeUndefined()
    expect(out.view.time_spent).toBeUndefined()
  })
})
