import type { InitConfiguration } from './configuration'

function validateConfiguration(init: InitConfiguration): boolean {
  if (!init.clientToken || !init.site) {
    return false
  }
  if (init.sessionSampleRate !== undefined && (init.sessionSampleRate < 0 || init.sessionSampleRate > 100)) {
    return false
  }
  return true
}

export { validateConfiguration }
