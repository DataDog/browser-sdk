import { Pipeline } from '@datadog/core-next'
import { startDomMutationCollection } from './domMutationCollector'

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('startDomMutationCollection', () => {
  let pipeline: Pipeline<Record<string, unknown>>
  let received: unknown[]
  let container: HTMLDivElement

  beforeEach(() => {
    pipeline = new Pipeline<Record<string, unknown>>()
    received = []
    pipeline.subscribe('resource:dom_mutation', (event) => {
      received.push(event)
    })
    pipeline.seal()

    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('returns a cleanup function', () => {
    const stop = startDomMutationCollection(pipeline)
    expect(typeof stop).toBe('function')
    stop()
  })

  it('publishes resource:dom_mutation when child is added', async () => {
    const stop = startDomMutationCollection(pipeline)

    const child = document.createElement('span')
    container.appendChild(child)
    await tick()

    expect(received.length).toBeGreaterThan(0)
    stop()
  })

  it('publishes resource:dom_mutation when attribute changes', async () => {
    const stop = startDomMutationCollection(pipeline)

    container.setAttribute('data-test', 'changed')
    await tick()

    expect(received.length).toBeGreaterThan(0)
    stop()
  })

  it('does not publish after stop()', async () => {
    const stop = startDomMutationCollection(pipeline)
    stop()

    const child = document.createElement('span')
    container.appendChild(child)
    await tick()

    expect(received.length).toBe(0)
  })
})
