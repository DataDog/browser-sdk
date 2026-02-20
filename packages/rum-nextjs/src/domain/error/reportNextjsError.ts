import { callMonitored, clocksNow, ErrorHandling, ErrorSource, generateUUID, mockable } from '@datadog/browser-core'
import { RumEventType } from '@datadog/browser-rum-core'
import { onRumStart } from '../nextjsPlugin'

interface NextjsErrorContext {
  digest?: string
  statusCode?: number
  router: 'app' | 'pages'
}

export function reportNextjsError(error: Error & { digest?: string }, resetOrStatusCode?: (() => void) | number) {
  const startClocks = mockable(clocksNow)()

  const context: NextjsErrorContext = {
    router: typeof resetOrStatusCode === 'function' ? 'app' : 'pages',
  }

  if (error.digest) {
    context.digest = error.digest
  }

  if (typeof resetOrStatusCode === 'number') {
    context.statusCode = resetOrStatusCode
  }

  onRumStart((addEvent) => {
    callMonitored(() => {
      addEvent(
        startClocks.relative,
        {
          type: RumEventType.ERROR,
          date: startClocks.timeStamp,
          error: {
            id: mockable(generateUUID)(),
            message: error.message,
            source: ErrorSource.SOURCE,
            stack: error.stack,
            type: error.name,
            handling: ErrorHandling.UNHANDLED,
            source_type: 'browser',
          },
          context: {
            framework: 'nextjs',
            ...context,
          },
        },
        {
          error,
        }
      )
    })
  })
}
