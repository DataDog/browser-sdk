import type { Observable } from '@datadog/browser-core'

/**
 * Abstract interface for session management in logs core
 * This allows different session management strategies for browser vs worker environments
 */
export interface LogsSessionManager {
  /**
   * Observable that emits when the session should expire/end
   */
  expireObservable: Observable<void>
}