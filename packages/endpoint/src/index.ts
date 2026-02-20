export { generateBundle, generateCombinedBundle, fetchConfig } from './bundleGenerator.ts'
export type { GenerateBundleOptions, CombineBundleOptions, FetchConfigOptions } from './bundleGenerator.ts'

// eslint-disable-next-line local-rules/disallow-side-effects -- Node.js build tool, not browser SDK
export type { RumRemoteConfiguration, RemoteConfigResult } from '@datadog/browser-remote-config'
