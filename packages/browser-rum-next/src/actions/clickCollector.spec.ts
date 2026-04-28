import { Pipeline } from '@datadog/core-next'
import { startClickCollection, computeSelector } from './clickCollector'

function waitMicrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('startClickCollection', () => {
  let pipeline: Pipeline<Record<string, unknown>>
  let received: unknown[]
  let container: HTMLDivElement

  beforeEach(() => {
    pipeline = new Pipeline<Record<string, unknown>>()
    received = []
    pipeline.subscribe('action:click', (event) => {
      received.push(event)
    })
    pipeline.seal()

    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('publishes action:click on pointerdown + pointerup', async () => {
    const stop = startClickCollection(pipeline)

    const target = document.createElement('button')
    target.textContent = 'Submit'
    container.appendChild(target)

    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    await waitMicrotask()

    expect(received.length).toBe(1)
    stop()
  })

  it('includes name from getActionName', async () => {
    const stop = startClickCollection(pipeline)

    const target = document.createElement('button')
    target.textContent = 'Click Me'
    container.appendChild(target)

    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    await waitMicrotask()

    const event = received[0] as any
    expect(event.name).toBe('Click Me')
    expect(event.nameSource).toBe('text_content')
    stop()
  })

  it('includes position from pointerup event', async () => {
    const stop = startClickCollection(pipeline)

    const target = document.createElement('button')
    target.textContent = 'Click'
    container.appendChild(target)

    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 42, clientY: 99 }))
    await waitMicrotask()

    const event = received[0] as any
    expect(event.positionX).toBe(42)
    expect(event.positionY).toBe(99)
    stop()
  })

  it('includes pointerUpDelay', async () => {
    const stop = startClickCollection(pipeline)

    const target = document.createElement('button')
    target.textContent = 'Click'
    container.appendChild(target)

    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    await waitMicrotask()

    const event = received[0] as any
    expect(typeof event.pointerUpDelay).toBe('number')
    expect(event.pointerUpDelay).toBeGreaterThanOrEqual(0)
    stop()
  })

  it('cleanup removes listeners', async () => {
    const stop = startClickCollection(pipeline)
    stop()

    const target = document.createElement('button')
    target.textContent = 'Click'
    container.appendChild(target)

    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    await waitMicrotask()

    expect(received.length).toBe(0)
  })

  it('does not publish if no pointerdown preceded pointerup', async () => {
    const stop = startClickCollection(pipeline)

    const target = document.createElement('button')
    target.textContent = 'Click'
    container.appendChild(target)

    target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    await waitMicrotask()

    expect(received.length).toBe(0)
    stop()
  })
})

describe('computeSelector', () => {
  it('returns tag#id when element has id', () => {
    const el = document.createElement('button')
    el.id = 'submit-btn'
    expect(computeSelector(el)).toBe('button#submit-btn')
  })

  it('returns tag.class when element has class', () => {
    const el = document.createElement('div')
    el.className = 'foo bar'
    expect(computeSelector(el)).toBe('div.foo.bar')
  })

  it('returns just tag when element has no id or class', () => {
    const el = document.createElement('span')
    expect(computeSelector(el)).toBe('span')
  })
})
