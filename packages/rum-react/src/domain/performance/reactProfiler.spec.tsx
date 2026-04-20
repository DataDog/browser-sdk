import React, { act } from 'react'
import { createIdentityEncoder } from '@datadog/browser-core'
import {
  interceptRequests,
  DEFAULT_FETCH_MOCK,
  readFormDataRequest,
  waitNextMicrotask,
} from '@datadog/browser-core/test'
import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import { createRumSessionManagerMock, mockRumConfiguration, mockViewHistory } from '@datadog/browser-rum-core/test'
import { registerCleanupTask } from '../../../../core/test'
import { appendComponent } from '../../../test/appendComponent'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { initReactOldBrowsersSupport } from '../../../test/reactOldBrowsersSupport'
import type { Clock } from '../../../../core/test'
import { mockClock } from '../../../../core/test'
import type { ReactProfileEvent } from '../../types/reactProfiling'
import type { ReactProfileTrace } from '../../types/reactProfileTrace'
import { ReactProfiler } from './reactProfiler'

interface ReactProfilePayload {
  event: ReactProfileEvent
  'react-profiling.json': ReactProfileTrace
}

const RENDER_DURATION = 100
const EFFECT_DURATION = 101
const LAYOUT_EFFECT_DURATION = 102
const TOTAL_DURATION_NS = (RENDER_DURATION + EFFECT_DURATION + LAYOUT_EFFECT_DURATION) * 1e6

function ChildComponent({ clock }: { clock: Clock }) {
  clock.tick(RENDER_DURATION)
  React.useEffect(() => clock.tick(EFFECT_DURATION))
  React.useLayoutEffect(() => clock.tick(LAYOUT_EFFECT_DURATION))
  return null
}

/**
 * Replace React.Profiler with a passthrough so the sentinel path runs without
 * the Profiler firing.  Registers a cleanup task to restore the original.
 */
function disableReactProfiler() {
  const originalProfiler = React.Profiler
  ;(React as any).Profiler = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children)
  registerCleanupTask(() => {
    ;(React as any).Profiler = originalProfiler
  })
}

describe('ReactProfiler', () => {
  let clock: Clock
  let interceptor: ReturnType<typeof interceptRequests>

  beforeEach(() => {
    clock = mockClock()
    initReactOldBrowsersSupport()
    interceptor = interceptRequests()
    interceptor.withFetch(DEFAULT_FETCH_MOCK, DEFAULT_FETCH_MOCK, DEFAULT_FETCH_MOCK)
  })

  function setupProfiler({ profilingSampleRate = 100 }: { profilingSampleRate?: number } = {}) {
    const lifeCycle = new LifeCycle()
    const sessionManager = createRumSessionManagerMock().setId('session-id-1')
    const viewHistory = mockViewHistory({ id: 'view-id-1', name: 'view-name-1' })
    const rumConfiguration = mockRumConfiguration({ profilingSampleRate })

    initializeReactPlugin({
      lifeCycle,
      sessionManager,
      viewHistory,
      createEncoder: createIdentityEncoder,
      rumConfiguration,
    })

    return { lifeCycle, sessionManager }
  }

  async function getProfilePayload(): Promise<ReactProfilePayload> {
    // Flush: queueMicrotask (batch flush) + transport.send async chain
    await waitNextMicrotask()
    await waitNextMicrotask()
    return readFormDataRequest<ReactProfilePayload>(interceptor.requests[interceptor.requests.length - 1])
  }

  function getSamples(payload: ReactProfilePayload) {
    return payload['react-profiling.json'].samples
  }

  describe('sampling', () => {
    it('should not collect data when profilingSampleRate is 0', async () => {
      setupProfiler({ profilingSampleRate: 0 })

      appendComponent(
        <ReactProfiler name="ChildComponent">
          <ChildComponent clock={clock} />
        </ReactProfiler>
      )

      await waitNextMicrotask()
      await waitNextMicrotask()
      expect(interceptor.requests.length).toBe(0)
    })

    it('should just render children when not sampled', () => {
      setupProfiler({ profilingSampleRate: 0 })

      const container = appendComponent(
        <ReactProfiler name="ChildComponent">
          <div id="child" />
        </ReactProfiler>
      )

      expect(container.querySelector('#child')).toBeTruthy()
    })
  })

  describe('profiling build mode (React.Profiler fires)', () => {
    it('should emit a profile with a mount phase render', async () => {
      const { lifeCycle } = setupProfiler()

      appendComponent(
        <ReactProfiler name="ChildComponent">
          <ChildComponent clock={clock} />
        </ReactProfiler>
      )

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED, undefined as any)

      const payload = await getProfilePayload()
      const samples = getSamples(payload)
      expect(samples.length).toBe(1)
      expect(samples[0].renders[0].component).toBe('ChildComponent')
      expect(samples[0].renders[0].phase).toBe('mount')
    })

    it('should include base_duration', async () => {
      const { lifeCycle } = setupProfiler()

      appendComponent(
        <ReactProfiler name="ChildComponent">
          <ChildComponent clock={clock} />
        </ReactProfiler>
      )

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED, undefined as any)

      const payload = await getProfilePayload()
      const render = getSamples(payload)[0].renders[0]
      expect(render.base_duration).toBeDefined()
      expect(typeof render.base_duration).toBe('number')
    })

    it('should not include phase split fields', async () => {
      const { lifeCycle } = setupProfiler()

      appendComponent(
        <ReactProfiler name="ChildComponent">
          <ChildComponent clock={clock} />
        </ReactProfiler>
      )

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED, undefined as any)

      const payload = await getProfilePayload()
      const render = getSamples(payload)[0].renders[0]
      expect(render.render_phase_duration).toBeUndefined()
      expect(render.layout_effect_phase_duration).toBeUndefined()
      expect(render.effect_phase_duration).toBeUndefined()
    })

    it('should report update phase on re-render', async () => {
      const { lifeCycle } = setupProfiler()

      let forceUpdate: () => void

      function App() {
        const [, setState] = React.useState(0)
        forceUpdate = () => setState((prev) => prev + 1)
        return (
          <ReactProfiler name="ChildComponent">
            <ChildComponent clock={clock} />
          </ReactProfiler>
        )
      }

      appendComponent(<App />)

      act(() => {
        forceUpdate!()
      })

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED, undefined as any)

      const payload = await getProfilePayload()
      const samples = getSamples(payload)
      expect(samples.length).toBe(2)
      expect(samples[1].renders[0].phase).toBe('update')
    })

    it('should still render children', () => {
      setupProfiler()

      const container = appendComponent(
        <ReactProfiler name="ChildComponent">
          <div id="child" />
        </ReactProfiler>
      )

      expect(container.querySelector('#child')).toBeTruthy()
    })
  })

  describe('standard mode (React.Profiler disabled / no profiling build)', () => {
    beforeEach(() => {
      disableReactProfiler()
    })

    it('should emit a profile with a mount phase render and correct duration', async () => {
      const { lifeCycle } = setupProfiler()

      appendComponent(
        <ReactProfiler name="ChildComponent">
          <ChildComponent clock={clock} />
        </ReactProfiler>
      )

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED, undefined as any)

      const payload = await getProfilePayload()
      const render = getSamples(payload)[0].renders[0]
      expect(render.component).toBe('ChildComponent')
      expect(render.phase).toBe('mount')
      expect(render.duration).toBe(TOTAL_DURATION_NS)
    })

    it('should include phase split durations in nanoseconds', async () => {
      const { lifeCycle } = setupProfiler()

      appendComponent(
        <ReactProfiler name="ChildComponent">
          <ChildComponent clock={clock} />
        </ReactProfiler>
      )

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED, undefined as any)

      const payload = await getProfilePayload()
      const render = getSamples(payload)[0].renders[0]
      expect(render.render_phase_duration).toBe(RENDER_DURATION * 1e6)
      expect(render.effect_phase_duration).toBe(EFFECT_DURATION * 1e6)
      expect(render.layout_effect_phase_duration).toBe(LAYOUT_EFFECT_DURATION * 1e6)
    })

    it('should report update phase on re-render', async () => {
      const { lifeCycle } = setupProfiler()

      let forceUpdate: () => void

      function App() {
        const [, setState] = React.useState(0)
        forceUpdate = () => setState((prev) => prev + 1)
        return (
          <ReactProfiler name="ChildComponent">
            <ChildComponent clock={clock} />
          </ReactProfiler>
        )
      }

      appendComponent(<App />)

      clock.tick(1)

      act(() => {
        forceUpdate!()
      })

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED, undefined as any)

      const payload = await getProfilePayload()
      const samples = getSamples(payload)
      expect(samples.length).toBe(2)
      expect(samples[1].renders[0].phase).toBe('update')
    })

    it('should not include base_duration', async () => {
      const { lifeCycle } = setupProfiler()

      appendComponent(
        <ReactProfiler name="ChildComponent">
          <ChildComponent clock={clock} />
        </ReactProfiler>
      )

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED, undefined as any)

      const payload = await getProfilePayload()
      expect(getSamples(payload)[0].renders[0].base_duration).toBeUndefined()
    })

    it('should still render children', () => {
      setupProfiler()

      const container = appendComponent(
        <ReactProfiler name="ChildComponent">
          <div id="child" />
        </ReactProfiler>
      )

      expect(container.querySelector('#child')).toBeTruthy()
    })
  })

  describe('sample batching', () => {
    it('should group renders from the same React commit into one sample', async () => {
      const { lifeCycle } = setupProfiler()

      appendComponent(
        <>
          <ReactProfiler name="ComponentA">
            <ChildComponent clock={clock} />
          </ReactProfiler>
          <ReactProfiler name="ComponentB">
            <ChildComponent clock={clock} />
          </ReactProfiler>
        </>
      )

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED, undefined as any)

      const payload = await getProfilePayload()
      const samples = getSamples(payload)
      expect(samples.length).toBe(1)
      expect(samples[0].renders.length).toBe(2)
      const components = samples[0].renders.map((r) => r.component)
      expect(components).toContain('ComponentA')
      expect(components).toContain('ComponentB')
    })

    it('should put renders from different React commits into separate samples', async () => {
      const { lifeCycle } = setupProfiler()

      let forceUpdate: () => void

      function App() {
        const [, setState] = React.useState(0)
        forceUpdate = () => setState((prev) => prev + 1)
        return (
          <ReactProfiler name="ChildComponent">
            <ChildComponent clock={clock} />
          </ReactProfiler>
        )
      }

      appendComponent(<App />)

      act(() => {
        forceUpdate!()
      })

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED, undefined as any)

      const payload = await getProfilePayload()
      expect(getSamples(payload).length).toBe(2)
    })
  })

  describe('deduplication', () => {
    it('should emit only one render per ReactProfiler per commit', async () => {
      const { lifeCycle } = setupProfiler()

      appendComponent(
        <ReactProfiler name="ChildComponent">
          <ChildComponent clock={clock} />
        </ReactProfiler>
      )

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED, undefined as any)

      const payload = await getProfilePayload()
      expect(getSamples(payload)[0].renders.length).toBe(1)
    })
  })

  describe('session lifecycle', () => {
    it('should stop profiling when session expires and flush pending data', async () => {
      const { lifeCycle } = setupProfiler()

      appendComponent(
        <ReactProfiler name="ChildComponent">
          <ChildComponent clock={clock} />
        </ReactProfiler>
      )

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED, undefined as any)

      await waitNextMicrotask()
      await waitNextMicrotask()
      expect(interceptor.requests.length).toBe(1)
    })

    it('should include session ID in the event', async () => {
      const { lifeCycle } = setupProfiler()

      appendComponent(
        <ReactProfiler name="ChildComponent">
          <ChildComponent clock={clock} />
        </ReactProfiler>
      )

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED, undefined as any)

      const payload = await getProfilePayload()
      expect(payload.event.session?.id).toBe('session-id-1')
    })

    it('should include view ID and name in the event', async () => {
      const { lifeCycle } = setupProfiler()

      appendComponent(
        <ReactProfiler name="ChildComponent">
          <ChildComponent clock={clock} />
        </ReactProfiler>
      )

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED, undefined as any)

      const payload = await getProfilePayload()
      expect(payload.event.view?.id).toEqual(['view-id-1'])
      expect(payload.event.view?.name).toEqual(['view-name-1'])
    })
  })
})
