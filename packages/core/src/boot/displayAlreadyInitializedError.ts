import type { InitConfiguration } from '../domain/configuration'
import { display } from '../tools/display'

export function displayAlreadyInitializedError(sdkName: 'MV_SDK_DD_RUM' | 'MV_SDK_DD_LOGS', initConfiguration: InitConfiguration) {
  if (!initConfiguration.silentMultipleInit) {
    display.error(`${sdkName} is already initialized.`)
  }
}
