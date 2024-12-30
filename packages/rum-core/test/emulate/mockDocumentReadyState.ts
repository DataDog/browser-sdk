import { DOM_EVENT } from '@datadog/browser-core'
import { createNewEvent } from '../../../core/test'

export function mockDocumentReadyState() {
  let readyState: DocumentReadyState = 'loading'
  spyOnProperty(Document.prototype, 'readyState', 'get').and.callFake(() => readyState)
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
