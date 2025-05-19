import { createLogger } from '../common/logger'
import { evalInWindow } from './evalInWindow'

const logger = createLogger('flushEvents')
export const flushScript = `
const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
Object.defineProperty(Document.prototype, 'visibilityState', { value: 'hidden' });
const hiddenEvent = new Event('visibilitychange', { bubbles: true});
hiddenEvent.__ddIsTrusted = true;
document.dispatchEvent(hiddenEvent);
Object.defineProperty(Document.prototype, 'visibilityState', descriptor);
document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
`
export function flushEvents() {
  evalInWindow(flushScript).catch((error) => {
    logger.error('Error while flushing events:', error)
  })
}
