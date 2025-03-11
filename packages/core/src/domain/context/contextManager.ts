import { sanitize } from '../../tools/serialisation/sanitize'
import type { Context } from '../../tools/serialisation/context'
import { Observable } from '../../tools/observable'
import { display } from '../../tools/display'
import type { RelativeTime } from '../../tools/utils/timeUtils'
import { dateNow } from '../../tools/utils/timeUtils'
import { computeBytesCount } from '../../tools/utils/byteUtils'
import type { CustomerDataTracker } from './customerDataTracker'
import { checkContext } from './contextUtils'

export type ContextManager = ReturnType<typeof createContextManager>

export type PropertiesConfig = {
  [key: string]: {
    required?: boolean
    type?: 'string'
  }
}

function ensureProperties(context: Context, propertiesConfig: PropertiesConfig, name: string) {
  const newContext = { ...context }

  for (const [key, { required, type }] of Object.entries(propertiesConfig)) {
    /**
     * Ensure specified properties are strings as defined here:
     * https://docs.datadoghq.com/logs/log_configuration/attributes_naming_convention/#user-related-attributes
     */
    if (type === 'string' && key in newContext) {
      /* eslint-disable @typescript-eslint/no-base-to-string */
      newContext[key] = String(newContext[key])
    }

    if (required && !(key in context)) {
      display.warn(`The property ${key} of ${name} is required; context will not be sent to the intake.`)
    }
  }

  return newContext
}

type ContextLogEntry = {
  timestamp: number
  change: Partial<Context> | undefined
}

export function createContextManager(
  name: string = '',
  {
    customerDataTracker,
    propertiesConfig = {},
  }: {
    customerDataTracker?: CustomerDataTracker
    propertiesConfig?: PropertiesConfig
  } = {}
) {
  let context: Context = {}
  const changeObservable = new Observable<void>()
  const logs: ContextLogEntry[] = []
  if (!(window as any)._dd_logs) {
    ;(window as any)._dd_logs = { size: {} }
  }
  ;(window as any)._dd_logs[name] = logs

  // eslint-disable-next-line local-rules/disallow-zone-js-patched-values
  setInterval(() => {
    ;(window as any)._dd_logs['size'][name] = computeBytesCount(JSON.stringify(logs))
  }, 1000)

  const contextManager = {
    getContext: (timestamp?: RelativeTime) => {
      if (!timestamp) {
        return context
      }

      const reconstructedContext: Context = {}
      for (const entry of logs) {
        if (entry.timestamp > timestamp) {
          break
        }
        Object.assign(reconstructedContext, entry.change)
      }

      return reconstructedContext
    },

    setContext: (newContext: unknown) => {
      if (checkContext(newContext)) {
        context = sanitize(ensureProperties(newContext, propertiesConfig, name))
        logs.push({ timestamp: dateNow(), change: context })
        customerDataTracker?.updateCustomerData(context)
      } else {
        contextManager.clearContext()
      }
      changeObservable.notify()
    },

    setContextProperty: (key: string, property: any) => {
      context = sanitize(ensureProperties({ ...context, [key]: property }, propertiesConfig, name))
      logs.push({ timestamp: dateNow(), change: { [key]: property } })
      customerDataTracker?.updateCustomerData(context)
      changeObservable.notify()
    },

    removeContextProperty: (key: string) => {
      delete context[key]
      logs.push({ timestamp: dateNow(), change: { [key]: undefined } })
      customerDataTracker?.updateCustomerData(context)
      ensureProperties(context, propertiesConfig, name)
      changeObservable.notify()
    },

    clearContext: () => {
      context = {}
      logs.push({ timestamp: dateNow(), change: undefined })
      customerDataTracker?.resetCustomerData()
      changeObservable.notify()
    },

    changeObservable,
  }

  return contextManager
}
