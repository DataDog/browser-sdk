import type { InitConfiguration } from '../configuration'
import { noop } from '../../tools/utils/functionUtils'
import { monitorWithErrorContext } from '../../tools/monitor'

export interface Plugin {
  name: string
  version: string
  onRegistered?: (global: any) => void
  beforeSend?: InitConfiguration['beforeSend']
}

export function monitorPlugin(plugin: Plugin, method: Plugin['onRegistered'] | Plugin['beforeSend']) {
  if (method) {
    return monitorWithErrorContext({ plugin: { name: plugin.name, version: plugin.version } }, method.bind(plugin))
  }
  return noop
}
