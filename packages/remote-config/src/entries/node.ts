import {
  resolveDynamicValues as resolveDynamicValuesFn,
  fetchRemoteConfiguration,
  buildEndpoint,
} from '../remoteConfiguration'
import { nodeContextItemHandler } from '../nodeResolution'

/**
 * Resolve dynamic RC values for Node.js code generation.
 * DynamicOption fields are converted to inline JS expression strings (CodeExpression)
 * rather than resolved against live browser APIs.
 */
export function resolveDynamicValues(
  configValue: unknown,
  options: {
    onCookie?: (value: string | undefined) => void
    onDom?: (value: string | null | undefined) => void
    onJs?: (value: unknown) => void
  } = {}
): unknown {
  return resolveDynamicValuesFn(configValue, {
    ...options,
    contextItemHandler: nodeContextItemHandler,
  })
}

export { serializeConfigToJs } from '../nodeResolution'
export { fetchRemoteConfiguration, buildEndpoint } from '../remoteConfiguration'
