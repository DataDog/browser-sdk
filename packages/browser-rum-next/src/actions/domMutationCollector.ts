import type { Pipeline } from '@datadog/core-next'

function startDomMutationCollection(pipeline: Pipeline<Record<string, unknown>>): () => void {
  if (typeof MutationObserver === 'undefined') return () => {}

  const observer = new MutationObserver(() => {
    pipeline.publish('resource:dom_mutation', { timestamp: performance.now() })
  })

  const target = document.body || document.documentElement
  observer.observe(target, {
    attributes: true,
    childList: true,
    subtree: true,
  })

  return () => observer.disconnect()
}

export { startDomMutationCollection }
