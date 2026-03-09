import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { initializeVuePlugin } from '../../../test/initializeVuePlugin'
import { mockClock } from '../../../../core/test'
import { UNSTABLE_useVueComponentTracker } from './useVueComponentTracker'

const MOUNT_DURATION = 50

describe('UNSTABLE_useVueComponentTracker', () => {
  it('reports a vueComponentRender vital on mount', async () => {
    const addDurationVitalSpy = jasmine.createSpy()
    const clock = mockClock()
    initializeVuePlugin({ publicApi: { addDurationVital: addDurationVitalSpy } })

    const TrackedComponent = defineComponent({
      setup() {
        UNSTABLE_useVueComponentTracker('MyComponent')
      },
      render() {
        clock.tick(MOUNT_DURATION)
        return h('div')
      },
    })

    await mount(TrackedComponent)

    expect(addDurationVitalSpy).toHaveBeenCalledTimes(1)
    const [name, options] = addDurationVitalSpy.calls.mostRecent().args
    expect(name).toBe('vueComponentRender')
    expect(options).toEqual({
      description: 'MyComponent',
      startTime: jasmine.any(Number),
      duration: jasmine.any(Number),
      context: {
        is_first_render: true,
        framework: 'vue',
      },
    })
  })

  it('reports is_first_render: false on update', async () => {
    const addDurationVitalSpy = jasmine.createSpy()
    initializeVuePlugin({ publicApi: { addDurationVital: addDurationVitalSpy } })

    const TrackedComponent = defineComponent({
      props: ['count'],
      setup() {
        UNSTABLE_useVueComponentTracker('MyComponent')
      },
      render() {
        return h('div', this.count)
      },
    })

    const wrapper = await mount(TrackedComponent, { props: { count: 0 } })
    await wrapper.setProps({ count: 1 })

    expect(addDurationVitalSpy).toHaveBeenCalledTimes(2)
    const options = addDurationVitalSpy.calls.mostRecent().args[1]
    expect(options.context.is_first_render).toBe(false)
  })
})
