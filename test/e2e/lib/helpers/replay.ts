import type { RumInitConfiguration } from '@datadog/browser-rum-core'
import type { IntakeRegistry } from '../framework'

export function getFirstSegment(intakeRegistry: IntakeRegistry) {
  return intakeRegistry.sessionReplay[0].segment.data
}

export function getLastSegment(intakeRegistry: IntakeRegistry) {
  return intakeRegistry.sessionReplay[intakeRegistry.sessionReplay.length - 1].segment.data
}

export function initRumAndStartRecording(initConfiguration: RumInitConfiguration) {
  window.DD_RUM!.init(initConfiguration)
  window.DD_RUM!.startSessionReplayRecording()
}
