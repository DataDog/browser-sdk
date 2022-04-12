import { listenAction } from '../actions'
import { evaluateCodeInActiveTab } from '../utils'

listenAction('flushEvents', () =>
  // Simulates a brief page visibility change (visible > hide > visible)
  evaluateCodeInActiveTab(() => {
    const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')!
    Object.defineProperty(Document.prototype, 'visibilityState', { value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
    Object.defineProperty(Document.prototype, 'visibilityState', descriptor)
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
  })
)
