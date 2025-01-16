import React from 'react'
import { appendComponent } from '../../../test/appendComponent'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
// eslint-disable-next-line camelcase
import { UNSTABLE_ReactComponentTracker } from './reactComponentTracker'

describe('UNSTABLE_ReactComponentTracker', () => {
  it('calls addDurationVital after the component rendering', () => {
    const addDurationVitalSpy = jasmine.createSpy()
    initializeReactPlugin({
      publicApi: {
        addDurationVital: addDurationVitalSpy,
      },
    })
    appendComponent(
      // eslint-disable-next-line camelcase
      <UNSTABLE_ReactComponentTracker name="reactComponentRender">
        <div>child</div>
      </UNSTABLE_ReactComponentTracker>
    )

    expect(addDurationVitalSpy).toHaveBeenCalledTimes(1)
    const [componentName, payload] = addDurationVitalSpy.calls.mostRecent().args
    expect(componentName).toBe('reactComponentRender')
    expect(payload.context.is_first_render).toBe(true)
  })
})
