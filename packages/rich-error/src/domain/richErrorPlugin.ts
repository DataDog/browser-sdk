import type { RumErrorEvent, RumErrorEventDomainContext, RumPlugin, RumPublicApi } from '@datadog/browser-rum-core'
import { RichError } from './richError'

let globalPublicApi: RumPublicApi | undefined
type Subscriber = (rumPublicApi: RumPublicApi) => void

const onInitSubscribers: Subscriber[] = []

export function richErrorPlugin() {
  return {
    name: 'rich-error',
    onInit({ publicApi }) {
      globalPublicApi = publicApi
      onInitSubscribers.forEach((subscriber) => subscriber(publicApi))
      const originalConfiguration = publicApi.getInitConfiguration();
      if (!originalConfiguration) {
        throw new Error('RUM has not been initialized');
      }
      publicApi.init(Object.assign({},
        originalConfiguration,
        {
        beforeSend: (
    event: RumErrorEvent,
    context: RumErrorEventDomainContext,
        ) => {
    if (event.context && event.type === 'error' && 'error' in context && context.error instanceof RichError && context.error.errorContext !== undefined) {
            Object.assign(event.context, context.error.errorContext);
    }
        return originalConfiguration?.beforeSend?.(event,context);
        }
      }))
    },
  } satisfies RumPlugin
}

export function onPluginInit(callback: Subscriber) {
  if (globalPublicApi) {
    callback(globalPublicApi)
  } else {
    onInitSubscribers.push(callback)
  }
}

export function resetReactPlugin() {
  globalPublicApi = undefined
  onInitSubscribers.length = 0
}
