import type { Extension } from '@datadog/core-next'

interface RumInitConfiguration {
  trackResources?: boolean
  trackLongTasks?: boolean
  trackErrors?: boolean
}

interface RumConfig {
  trackResources: boolean
  trackLongTasks: boolean
  trackErrors: boolean
}

const rumExtension: Extension<'rum', RumInitConfiguration, RumConfig> = {
  key: 'rum',
  validate(init: RumInitConfiguration | undefined): RumConfig | null {
    if (!init) return null
    return {
      trackResources: init.trackResources !== false,
      trackLongTasks: init.trackLongTasks !== false,
      trackErrors: init.trackErrors !== false,
    }
  },
}

export { rumExtension }
export type { RumInitConfiguration, RumConfig }
