export interface RumRuntimeCapabilities {
  requestCollection?: boolean
  runtimeErrors?: boolean
  viewMetrics?: boolean
}

export interface ResolvedRumRuntimeCapabilities {
  requestCollection: boolean
  runtimeErrors: boolean
  viewMetrics: boolean
}

export const DEFAULT_RUM_RUNTIME_CAPABILITIES: ResolvedRumRuntimeCapabilities = {
  requestCollection: true,
  runtimeErrors: true,
  viewMetrics: true,
}

export function resolveRumRuntimeCapabilities(
  runtimeCapabilities?: RumRuntimeCapabilities
): ResolvedRumRuntimeCapabilities {
  return {
    ...DEFAULT_RUM_RUNTIME_CAPABILITIES,
    ...runtimeCapabilities,
  }
}
