import type { DocumentWithPrerendering } from '@datadog/browser-core'
import { isPagePrerendered } from '@datadog/browser-core'

export function onPrerenderActivation(
  callback: () => void
): () => void {
  if (!isPagePrerendered()) {
    return () => {}
  }

  const prerenderingChangeHandler = () => {
    if (!(document as DocumentWithPrerendering).prerendering) {
      callback()
    }
  }

  document.addEventListener('prerenderingchange', prerenderingChangeHandler, { capture: true })
  
  return () => {
    document.removeEventListener('prerenderingchange', prerenderingChangeHandler, { capture: true })
  }
} 