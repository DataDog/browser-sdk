import type { RawTelemetryUsage, RawTelemetryUsageFeature } from '../telemetry'
import { addTelemetryUsage } from '../telemetry'
import { monitor } from '../../tools/monitor'
import type { BoundedBuffer } from '../../tools/boundedBuffer'
import type { ContextManager } from './contextManager'
import type { ContextManagerMethod, CustomerContextKey } from './contextConstants'

export function defineContextMethod<MethodName extends ContextManagerMethod, Key extends CustomerContextKey>(
  getStrategy: () => Record<Key, ContextManager>,
  contextName: Key,
  methodName: MethodName,
  usage?: RawTelemetryUsageFeature
): ContextManager[MethodName] {
  return monitor((...args: any[]) => {
    if (usage) {
      addTelemetryUsage({ feature: usage } as RawTelemetryUsage)
    }
    return (getStrategy()[contextName][methodName] as (...args: unknown[]) => unknown)(...args)
  }) as ContextManager[MethodName]
}

export function bufferContextCalls<Key extends string, StartResult extends Record<Key, ContextManager>>(
  preStartContextManager: ContextManager,
  name: Key,
  bufferApiCalls: BoundedBuffer<StartResult>
) {
  preStartContextManager.changeObservable.subscribe(() => {
    const context = preStartContextManager.getContext()
    bufferApiCalls.add((startResult) => startResult[name].setContext(context))
  })
}
