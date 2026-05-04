import { vi } from 'vitest'
import { DOM_EVENT } from '@datadog/browser-core'
import { createNewEvent } from '../../../core/test'

export function mockDocumentReadyState() {
  let readyState: DocumentReadyState = 'loading'
  vi.spyOn(Document.prototype, 'readyState', 'get').mockImplementation(() => readyState)
  return {
    triggerOnDomLoaded: () => {
      readyState = 'interactive'
      window.dispatchEvent(createNewEvent(DOM_EVENT.DOM_CONTENT_LOADED))
    },
    triggerOnLoad: () => {
      readyState = 'complete'
      window.dispatchEvent(createNewEvent(DOM_EVENT.LOAD))
    },
  }
}
