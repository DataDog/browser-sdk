import { deepClone } from '../../tools/mergeInto'
import { sanitize } from '../../tools/serialisation/sanitize'
import type { Context } from '../../tools/serialisation/context'
import { Observable } from '../../tools/observable'
import { display } from '../../tools/display'
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

  const contextManager = {
    getContext: () => deepClone(context),

    setContext: (newContext: unknown) => {
      if (checkContext(newContext)) {
        context = sanitize(ensureProperties(newContext, propertiesConfig, name))
        customerDataTracker?.updateCustomerData(context)
      } else {
        contextManager.clearContext()
      }
      changeObservable.notify()
    },

    setContextProperty: (key: string, property: any) => {
      context[key] = sanitize(ensureProperties({ [key]: property }, propertiesConfig, name)[key])
      customerDataTracker?.updateCustomerData(context)
      changeObservable.notify()
    },

    removeContextProperty: (key: string) => {
      delete context[key]
      customerDataTracker?.updateCustomerData(context)
      ensureProperties(context, propertiesConfig, name)
      changeObservable.notify()
    },

    clearContext: () => {
      context = {}
      customerDataTracker?.resetCustomerData()
      changeObservable.notify()
    },

    changeObservable,
  }
  return contextManager
}
