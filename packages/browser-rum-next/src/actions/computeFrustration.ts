import type { PendingClick } from './clickChain'

type FrustrationType = 'rage_click' | 'dead_click' | 'error_click'

interface ClickFrustration {
  click: PendingClick
  frustrationTypes: FrustrationType[]
}

interface FrustrationResult {
  isRage: boolean
  actions: ClickFrustration[]
}

const RAGE_CLICK_THRESHOLD = 3

function computeFrustration(clicks: PendingClick[]): FrustrationResult {
  const isRage = clicks.length >= RAGE_CLICK_THRESHOLD

  if (isRage) {
    const frustrationTypes: FrustrationType[] = ['rage_click']
    const hasError = clicks.some((c) => c.errorCount > 0)
    if (hasError) frustrationTypes.push('error_click')
    return {
      isRage: true,
      actions: [{ click: clicks[0], frustrationTypes }],
    }
  }

  const actions: ClickFrustration[] = clicks.map((click) => {
    const frustrationTypes: FrustrationType[] = []
    if (!click.activity.hadActivity && !isInteractiveElement(click.targetSelector)) {
      frustrationTypes.push('dead_click')
    }
    if (click.errorCount > 0) {
      frustrationTypes.push('error_click')
    }
    return { click, frustrationTypes }
  })

  return { isRage: false, actions }
}

const INTERACTIVE_TAGS = new Set(['input', 'textarea', 'select', 'label', 'canvas', 'a'])

function isInteractiveElement(selector: string): boolean {
  const tag = selector.split(/[.#\[]/)[0].toLowerCase()
  return INTERACTIVE_TAGS.has(tag)
}

export { computeFrustration, isInteractiveElement, RAGE_CLICK_THRESHOLD }
export type { FrustrationType, ClickFrustration, FrustrationResult }
