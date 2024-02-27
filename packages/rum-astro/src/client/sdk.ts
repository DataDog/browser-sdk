/* eslint-disable local-rules/disallow-side-effects */
/* eslint-disable @typescript-eslint/no-unused-vars */
import type { RumInitConfiguration } from '@datadog/browser-rum'
import { datadogRum } from '@datadog/browser-rum'

export function init(options: RumInitConfiguration): void {
  datadogRum.init(options)
  return
}
