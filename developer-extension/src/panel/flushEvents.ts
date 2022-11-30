import { createLogger } from '../common/logger'
import { evalInWindow } from './evalInWindow'

const logger = createLogger('flushEvents')

export function flushEvents() {
  evalInWindow(
    `
      const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')
      Object.defineProperty(Document.prototype, 'visibilityState', { value: 'hidden' })
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
      Object.defineProperty(Document.prototype, 'visibilityState', descriptor)
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
    `
  ).catch((error) => logger.error('Error while flushing events:', error))
}
