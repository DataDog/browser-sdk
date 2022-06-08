import { isExperimentalFeatureEnabled } from '@datadog/browser-core'

export function getDisplayContext() {
  if (!isExperimentalFeatureEnabled('clickmap')) return

  return {
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
  }
}
