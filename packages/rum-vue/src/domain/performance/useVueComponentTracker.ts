import { onBeforeMount, onMounted, onBeforeUpdate, onUpdated } from 'vue'
import { clocksNow } from '@datadog/browser-core'
import { addDurationVital } from './addDurationVital'

/**
 * Track the performance of a Vue component.
 *
 * @experimental
 * @category Performance
 * @example
 * ```ts
 * import { UNSTABLE_useVueComponentTracker } from '@datadog/browser-rum-vue'
 *
 * // Inside a component's setup():
 * UNSTABLE_useVueComponentTracker('MyComponent')
 * ```
 */
export function UNSTABLE_useVueComponentTracker(name: string): void {
  let mountStartClocks: ReturnType<typeof clocksNow> | undefined
  let updateStartClocks: ReturnType<typeof clocksNow> | undefined

  onBeforeMount(() => {
    mountStartClocks = clocksNow()
  })

  onMounted(() => {
    if (!mountStartClocks) return
    const duration = clocksNow().relative - mountStartClocks.relative
    addDurationVital('vueComponentRender', {
      description: name,
      startTime: mountStartClocks.timeStamp,
      duration,
      context: {
        is_first_render: true,
        framework: 'vue',
      },
    })
  })

  onBeforeUpdate(() => {
    updateStartClocks = clocksNow()
  })

  onUpdated(() => {
    if (!updateStartClocks) return
    const duration = clocksNow().relative - updateStartClocks.relative
    addDurationVital('vueComponentRender', {
      description: name,
      startTime: updateStartClocks.timeStamp,
      duration,
      context: {
        is_first_render: false,
        framework: 'vue',
      },
    })
  })
}
