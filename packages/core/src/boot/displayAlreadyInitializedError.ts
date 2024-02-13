import type { InitConfiguration } from '../domain/configuration'
import { display } from '../tools/display'

export function displayAlreadyInitializedError(sdkName: 'DD_RUM' | 'DD_LOGS', initConfiguration: InitConfiguration) {
  if (!initConfiguration.silentMultipleInit) {
    display.error(`${sdkName} is already initialized.`)
  }
}
