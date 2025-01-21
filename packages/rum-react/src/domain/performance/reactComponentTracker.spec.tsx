import React, { useEffect, useLayoutEffect } from 'react'
import { flushSync } from 'react-dom'
import { appendComponent } from '../../../test/appendComponent'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import type { Clock } from '../../../../core/test'
import { mockClock, registerCleanupTask } from '../../../../core/test'
// eslint-disable-next-line camelcase
import { UNSTABLE_ReactComponentTracker } from './reactComponentTracker'

const RENDER_DURATION = 100
const EFFECT_DURATION = 101
const LAYOUT_EFFECT_DURATION = 102
const TOTAL_DURATION = RENDER_DURATION + EFFECT_DURATION + LAYOUT_EFFECT_DURATION

function ChildComponent({ clock }: { clock: Clock }) {
  clock.tick(RENDER_DURATION)
  useEffect(() => clock.tick(EFFECT_DURATION))
  useLayoutEffect(() => clock.tick(LAYOUT_EFFECT_DURATION))
  return null
}

describe('UNSTABLE_ReactComponentTracker', () => {
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
    registerCleanupTask(() => clock.cleanup())
  })

  it('should call addDurationVital after the component rendering', () => {
    const addDurationVitalSpy = jasmine.createSpy()
    initializeReactPlugin({
      publicApi: {
        addDurationVital: addDurationVitalSpy,
      },
    })

    appendComponent(
      // eslint-disable-next-line camelcase
      <UNSTABLE_ReactComponentTracker name="ChildComponent">
        <ChildComponent clock={clock} />
      </UNSTABLE_ReactComponentTracker>
    )

    expect(addDurationVitalSpy).toHaveBeenCalledTimes(1)
    const [name, options] = addDurationVitalSpy.calls.mostRecent().args
    expect(name).toBe('reactComponentRender')
    expect(options).toEqual({
      description: 'ChildComponent',
      startTime: clock.timeStamp(0),
      duration: TOTAL_DURATION,
      context: {
        is_first_render: true,
        render_phase_duration: RENDER_DURATION,
        effect_phase_duration: EFFECT_DURATION,
        layout_effect_phase_duration: LAYOUT_EFFECT_DURATION,
        framework: 'react',
      },
    })
  })

  it('should call addDurationVital on rerender', () => {
    const addDurationVitalSpy = jasmine.createSpy()
    initializeReactPlugin({
      publicApi: {
        addDurationVital: addDurationVitalSpy,
      },
    })

    let forceUpdate: () => void

    function App() {
      const [, setState] = React.useState(0)
      forceUpdate = () => setState((prev) => prev + 1)
      return (
        <>
          {/* eslint-disable-next-line camelcase */}
          <UNSTABLE_ReactComponentTracker name="ChildComponent">
            <ChildComponent clock={clock} />
          </UNSTABLE_ReactComponentTracker>
        </>
      )
    }

    appendComponent(<App />)

    clock.tick(1)

    flushSync(() => {
      forceUpdate!()
    })

    expect(addDurationVitalSpy).toHaveBeenCalledTimes(2)
    const options = addDurationVitalSpy.calls.mostRecent().args[1]
    expect(options).toEqual({
      description: 'ChildComponent',
      startTime: clock.timeStamp(TOTAL_DURATION + 1),
      duration: TOTAL_DURATION,
      context: {
        is_first_render: false,
        render_phase_duration: RENDER_DURATION,
        effect_phase_duration: EFFECT_DURATION,
        layout_effect_phase_duration: LAYOUT_EFFECT_DURATION,
        framework: 'react',
      },
    })
  })
})
