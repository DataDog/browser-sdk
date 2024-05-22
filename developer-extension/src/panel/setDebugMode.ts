import { createLogger } from '../common/logger'
import { evalInWindow } from './evalInWindow'

const logger = createLogger('setDebug')

export function setDebugMode(enabled: boolean) {
  evalInWindow(
    `
      DD_RUM?._setDebug(${enabled})
      DD_LOGS?._setDebug(${enabled})
    `
  ).catch((error) => logger.error('Error while setting debug mode:', error))
}
