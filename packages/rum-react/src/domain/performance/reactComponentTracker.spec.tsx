import React from 'react'
import { appendComponent } from '../../../test/appendComponent'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
// eslint-disable-next-line
import { UNSTABLE_ReactComponentTracker } from './reactComponentTracker'


describe('UNSTABLE_ReactComponentTracker (simple)', () => {

  it('calls addDurationVital after the component rendering', () => {
    const addDurationVitalSpy = jasmine.createSpy()
    initializeReactPlugin({
        publicApi: {
            addDurationVital: addDurationVitalSpy,
        },
    })
    appendComponent(
    // eslint-disable-next-line
      <UNSTABLE_ReactComponentTracker name="MyTestComponent">
        <div>child</div>
      </UNSTABLE_ReactComponentTracker>
    )

    expect(addDurationVitalSpy).toHaveBeenCalledTimes(1)
    const [componentName, payload] = addDurationVitalSpy.calls.mostRecent().args
    expect(componentName).toBe('MyTestComponent')
    expect(payload.context.s_first_render).toBe(true)
  })
})
