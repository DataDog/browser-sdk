import { deepClone } from '../../tools/mergeInto'
import { getType } from '../../tools/utils/typeUtils'
import { sanitize } from '../../tools/serialisation/sanitize'
import type { Context } from '../../tools/serialisation/context'
import { Observable } from '../../tools/observable'
import { display } from '../../tools/display'
import type { CustomerDataTracker } from './customerDataTracker'

export type ContextManager = ReturnType<typeof createContextManager>

export type PropertiesConfig = {
  [key: string]: {
    required?: boolean
    type?: 'string'
  }
}

function enforceTypeProperties(context: Context, propertiesConfig: PropertiesConfig) {
  const newContext = { ...context }
  for (const [key, { type }] of Object.entries(propertiesConfig)) {
    if (type === 'string' && key in newContext) {
      /* eslint-disable @typescript-eslint/no-base-to-string */
      newContext[key] = String(newContext[key])
    }
  }

  return newContext
}

function checkRequiredProperties(context: Context, propertiesConfig: PropertiesConfig, name: string) {
  for (const [key, { required }] of Object.entries(propertiesConfig)) {
    if (required && !(key in context)) {
      display.warn(`The property ${key} of ${name} context is required; context will not be sent to the intake.`)
    }
  }
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

    setContext: (newContext: Context) => {
      if (getType(newContext) === 'object') {
        context = sanitize(enforceTypeProperties(newContext, propertiesConfig))
        customerDataTracker?.updateCustomerData(context)
      } else {
        contextManager.clearContext()
      }
      checkRequiredProperties(context, propertiesConfig, name)
      changeObservable.notify()
    },

    setContextProperty: (key: string, property: any) => {
      context[key] = sanitize(enforceTypeProperties({ [key]: property }, propertiesConfig)[key])
      customerDataTracker?.updateCustomerData(context)
      checkRequiredProperties(context, propertiesConfig, name)
      changeObservable.notify()
    },

    removeContextProperty: (key: string) => {
      delete context[key]
      customerDataTracker?.updateCustomerData(context)
      checkRequiredProperties(context, propertiesConfig, name)
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
