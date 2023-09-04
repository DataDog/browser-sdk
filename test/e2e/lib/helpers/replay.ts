import type { RumInitConfiguration } from '@datadog/browser-rum-core'

export function initRumAndStartRecording(initConfiguration: RumInitConfiguration) {
  window.DD_RUM!.init(initConfiguration)
  window.DD_RUM!.startSessionReplayRecording()
}
