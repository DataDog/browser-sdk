import { deepClone } from '../../tools/mergeInto'
import { sanitize } from '../../tools/serialisation/sanitize'
import type { Context } from '../../tools/serialisation/context'
import { Observable } from '../../tools/observable'
import { display } from '../../tools/display'
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

    if (type === 'string' && !isDefined(newContext[key])) {
      /* eslint-disable @typescript-eslint/no-base-to-string */
      newContext[key] = String(newContext[key])
    }

    if (required && isDefined(newContext[key])) {
      display.warn(`The property ${key} of ${name} is required; context will not be sent to the intake.`)
    }
  }

  return newContext
}

function isDefined(value: unknown) {
  return value === undefined || value === null || value === ''
}

export function createContextManager(
  name: string = '',
  {
    propertiesConfig = {},
  }: {
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
      } else {
        contextManager.clearContext()
      }
      changeObservable.notify()
    },

    setContextProperty: (key: string, property: any) => {
      context = sanitize(ensureProperties({ ...context, [key]: property }, propertiesConfig, name))
      changeObservable.notify()
    },

    removeContextProperty: (key: string) => {
      delete context[key]
      ensureProperties(context, propertiesConfig, name)
      changeObservable.notify()
    },

    clearContext: () => {
      context = {}
      changeObservable.notify()
    },

    changeObservable,
  }
  return contextManager
}
