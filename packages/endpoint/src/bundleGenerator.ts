import type { SdkVariant } from './sdkDownloader.ts'
import { getDefaultVersion, downloadSDK } from './sdkDownloader.ts'
import { INLINE_HELPERS } from './helpers.ts'
import { fetchRemoteConfiguration } from '@datadog/browser-remote-config'
import { resolveDynamicValues, serializeConfigToJs } from '@datadog/browser-remote-config/node'

export type { SdkVariant } from './sdkDownloader.ts'

export interface FetchConfigOptions {
  applicationId: string
  remoteConfigurationId: string
  site?: string
}

export interface CombineBundleOptions {
  sdkCode: string
  configJs: string
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
const VALID_VARIANTS: SdkVariant[] = ['rum', 'rum-slim', 'logs', 'rum-and-logs']

export async function fetchConfig(options: FetchConfigOptions) {
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

  return { ok: true as const, value: result.value }
}

export function generateCombinedBundle(options: CombineBundleOptions): string {
  const { sdkCode, configJs, variant, sdkVersion } = options
  const versionDisplay = sdkVersion ?? 'unknown'

  return `/**
 * Datadog Browser SDK with Embedded Remote Configuration
 * SDK Variant: ${variant}
 * SDK Version: ${versionDisplay}
 */
(function() {
  'use strict';

  // Inline helpers for dynamic value resolution
  ${INLINE_HELPERS}

  // Embedded remote configuration
  var __DATADOG_REMOTE_CONFIG__ = ${configJs};

  // SDK bundle (${variant}) from CDN
  ${sdkCode}

  // Auto-initialize — merge base config (clientToken, site, etc.) set by the page before this script
  var __DD_CONFIG__ = Object.assign({}, window.__DD_BASE_CONFIG__ || {}, __DATADOG_REMOTE_CONFIG__);
  if (typeof window !== 'undefined') {
    if (window.DD_RUM) { window.DD_RUM.init(__DD_CONFIG__); }
    if (window.DD_LOGS) { window.DD_LOGS.init(__DD_CONFIG__); }
  }
})();`
}

export async function generateBundle(options: GenerateBundleOptions): Promise<string> {
  if (!options.applicationId || typeof options.applicationId !== 'string') {
    throw new Error("Option 'applicationId' is required and must be a non-empty string.")
  }
  if (!options.remoteConfigurationId || typeof options.remoteConfigurationId !== 'string') {
    throw new Error("Option 'remoteConfigurationId' is required and must be a non-empty string.")
  }
  if (!VALID_VARIANTS.includes(options.variant)) {
    throw new Error(`Option 'variant' must be 'rum' or 'rum-slim', got '${String(options.variant)}'.`)
  }

  const configResult = await fetchConfig({
    applicationId: options.applicationId,
    remoteConfigurationId: options.remoteConfigurationId,
    site: options.site,
  })

  const resolved = resolveDynamicValues(configResult.value)
  const configJs = serializeConfigToJs(resolved)

  const sdkCode = await downloadSDK({ variant: options.variant, datacenter: options.datacenter })
  const sdkVersion = getDefaultVersion()

  return generateCombinedBundle({ sdkCode, configJs, variant: options.variant, sdkVersion })
}
