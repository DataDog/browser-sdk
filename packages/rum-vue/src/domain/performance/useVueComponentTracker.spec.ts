import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { initializeVuePlugin } from '../../../test/initializeVuePlugin'
import { mockClock, registerCleanupTask } from '../../../../core/test'
// eslint-disable-next-line camelcase
import { UNSTABLE_useVueComponentTracker } from './useVueComponentTracker'

const MOUNT_DURATION = 50

// Avoid @vue/test-utils to prevent Object.fromEntries compatibility issues on older browsers (Chrome 63)
function mountTrackedComponent(renderFn?: () => ReturnType<typeof h>) {
  const container = document.createElement('div')
  document.body.appendChild(container)

  const count = ref(0)

  const TrackedComponent = defineComponent({
    setup() {
      UNSTABLE_useVueComponentTracker('MyComponent')
      return { count }
    },
    render() {
      if (renderFn) {
        return renderFn()
      }
      return h('div', this.count)
    },
  })

  const app = createApp(TrackedComponent)
  app.mount(container)

  registerCleanupTask(() => {
    app.unmount()
    container.remove()
  })

  return { count, app }
}

describe('UNSTABLE_useVueComponentTracker', () => {
  it('reports a vueComponentRender vital on mount', () => {
    const addDurationVitalSpy = jasmine.createSpy()
    const clock = mockClock()
    initializeVuePlugin({ publicApi: { addDurationVital: addDurationVitalSpy } })

    mountTrackedComponent(() => {
      clock.tick(MOUNT_DURATION)
      return h('div')
    })

    expect(addDurationVitalSpy).toHaveBeenCalledTimes(1)
    const [name, options] = addDurationVitalSpy.calls.mostRecent().args
    expect(name).toBe('vueComponentRender')
    expect(options).toEqual({
      description: 'MyComponent',
      startTime: clock.timeStamp(0),
      duration: MOUNT_DURATION,
      context: {
        is_first_render: true,
        framework: 'vue',
      },
    })
  })

  it('reports is_first_render: false on update', async () => {
    const addDurationVitalSpy = jasmine.createSpy()
    initializeVuePlugin({ publicApi: { addDurationVital: addDurationVitalSpy } })

    const { count } = mountTrackedComponent()
    count.value++
    await nextTick()

    expect(addDurationVitalSpy).toHaveBeenCalledTimes(2)
    const options = addDurationVitalSpy.calls.mostRecent().args[1]
    expect(options.context.is_first_render).toBe(false)
  })
})
