import { DISCARD } from '@datadog/core-next'
import type { Enricher } from '@datadog/core-next'

type BeforeSendCallback = (event: Record<string, unknown>) => boolean | void

function beforeSendEnricher(
  beforeSend: BeforeSendCallback
): Enricher<Record<string, unknown>, Record<string, unknown>> {
  return {
    name: 'beforeSend',
    transform(data) {
      const result = beforeSend(data)
      if (result === false) {
        return DISCARD
      }
      return data
    },
  }
}

export { beforeSendEnricher }
export type { BeforeSendCallback }
