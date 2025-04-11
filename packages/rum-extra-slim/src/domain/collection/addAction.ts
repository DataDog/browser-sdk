import { sanitize } from '@datadog/browser-core'
import type { TransportManager } from '../transportManager'
import type { ActionEvent } from '../event'
import { EVENT } from '../event'

export function addAction(transportManager: TransportManager, key: unknown, value: unknown) {
  const data: ActionEvent = {
    type: EVENT.ACTION,
    key: sanitize(key) as string,
    value: sanitize(value),
  }

  transportManager.send(data)
}
