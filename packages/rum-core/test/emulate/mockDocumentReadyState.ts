import { createNewEvent } from '../../../core/test'

export function mockDocumentReadyState() {
  let readyState: DocumentReadyState = 'loading'
  spyOnProperty(Document.prototype, 'readyState', 'get').and.callFake(() => readyState)
  return {
    triggerOnDomLoaded: () => {
      readyState = 'interactive'
      window.dispatchEvent(createNewEvent('DOMContentLoaded'))
    },
    triggerOnLoad: () => {
      readyState = 'complete'
      window.dispatchEvent(createNewEvent('load'))
    },
  }
}
