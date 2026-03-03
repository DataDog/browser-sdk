import type { SdkVariant } from './sdkDownloader.ts'
import { CONTEXT_RESOLUTION_HELPERS } from './contextResolutionHelpers.ts'

export type { SdkVariant } from './sdkDownloader.ts'

export interface FetchConfigOptions {
  applicationId: string
  remoteConfigurationId: string
  site?: string
}

export interface CombineBundleOptions {
  sdkCode: string
  config: {
    applicationId: string
    [key: string]: unknown
  }
  variant: SdkVariant
  sdkVersion?: string
}

export interface GenerateBundleOptions {
  applicationId: string
  remoteConfigurationId: string
  variant: SdkVariant
  site?: string
  datacenter?: string
}

const CONFIG_FETCH_TIMEOUT_MS = 30_000

export async function fetchConfig(options: FetchConfigOptions): Promise<{
  ok: true
  value: {
    applicationId: string
    [key: string]: unknown
  }
}> {
  const { fetchRemoteConfiguration } = await import('@datadog/browser-remote-config')
  const result = await fetchRemoteConfiguration({
    applicationId: options.applicationId,
    remoteConfigurationId: options.remoteConfigurationId,
    site: options.site,
    signal: AbortSignal.timeout(CONFIG_FETCH_TIMEOUT_MS),
  })

  if (!result.ok) {
    throw new Error(
      `Failed to fetch remote configuration: ${result.error.message}\n` +
        `Verify applicationId "${options.applicationId}" and ` +
        `configId "${options.remoteConfigurationId}" are correct.`
    )
  }

  return { ok: true, value: result.value }
}

export function generateCombinedBundle(options: CombineBundleOptions): string {
  const { sdkCode, config, variant, sdkVersion } = options
  const configJson = JSON.stringify(config, null, 2)
  const versionDisplay = sdkVersion ?? 'unknown'

  const hasUser = Array.isArray(config.user) && (config.user as unknown[]).length > 0
  const hasContext = Array.isArray(config.context) && (config.context as unknown[]).length > 0
  const needsResolution = hasUser || hasContext

  const contextResolutionCode = needsResolution
    ? `// Resolve dynamic values for user and global context
    var __dd_user = {};
    (__DATADOG_REMOTE_CONFIG__.user || []).forEach(function(item) {
      __dd_user[item.key] = __dd_resolveContextValue(item.value);
    });
    var __dd_globalContext = {};
    (__DATADOG_REMOTE_CONFIG__.context || []).forEach(function(item) {
      __dd_globalContext[item.key] = __dd_resolveContextValue(item.value);
    });`
    : ''

  const initCallCode = needsResolution
    ? `window.DD_RUM.init(Object.assign({}, __DATADOG_REMOTE_CONFIG__, {
      "user": Object.keys(__dd_user).length ? __dd_user : undefined,
      "context": undefined,
      "globalContext": Object.keys(__dd_globalContext).length ? __dd_globalContext : undefined
    }));`
    : `window.DD_RUM.init(__DATADOG_REMOTE_CONFIG__);`

  const helpersCode = needsResolution ? CONTEXT_RESOLUTION_HELPERS.trim() : ''

  return `/**
 * Datadog Browser SDK with Embedded Remote Configuration
 * SDK Variant: ${variant}
 * SDK Version: ${versionDisplay}
 *
 * This bundle includes:
 * - Pre-fetched remote configuration
 * - Minified SDK code from CDN
 *
 * No additional network requests needed for SDK initialization.
 */
(function() {
  'use strict';

  // Embedded remote configuration
  var __DATADOG_REMOTE_CONFIG__ = ${configJson};

  // SDK bundle (${variant}) from CDN
  ${sdkCode}

  // Auto-initialize with embedded config
  if (typeof window !== 'undefined' && typeof window.DD_RUM !== 'undefined') {
    ${contextResolutionCode}
    ${initCallCode}
  }
  ${helpersCode ? '\n  ' + helpersCode : ''}
})();
`
}

const VALID_VARIANTS: SdkVariant[] = ['rum', 'rum-slim']

export async function generateBundle(options: GenerateBundleOptions): Promise<string> {
  if (!options.applicationId || typeof options.applicationId !== 'string') {
    throw new Error("Option 'applicationId' is required and must be a non-empty string.")
  }

  if (!options.remoteConfigurationId || typeof options.remoteConfigurationId !== 'string') {
    throw new Error(
      "Option 'remoteConfigurationId' is required and must be a non-empty string. " +
        'Get this from Datadog UI > Remote Configuration.'
    )
  }

  if (!VALID_VARIANTS.includes(options.variant)) {
    throw new Error(
      `Option 'variant' must be 'rum' or 'rum-slim', got '${String(options.variant)}'. ` +
        'Check your build configuration.'
    )
  }

  if (options.site !== undefined && typeof options.site !== 'string') {
    throw new Error("Option 'site' must be a string when provided (e.g. 'datadoghq.com' or 'datadoghq.eu').")
  }

  if (options.datacenter !== undefined && typeof options.datacenter !== 'string') {
    throw new Error("Option 'datacenter' must be a string when provided (e.g. 'us1').")
  }

  const configResult = await fetchConfig({
    applicationId: options.applicationId,
    remoteConfigurationId: options.remoteConfigurationId,
    site: options.site,
  })

  const { downloadSDK } = await import('./sdkDownloader.ts')
  const sdkCode = await downloadSDK({
    variant: options.variant,
    datacenter: options.datacenter,
  })

  return generateCombinedBundle({
    sdkCode,
    config: configResult.value,
    variant: options.variant,
  })
}
