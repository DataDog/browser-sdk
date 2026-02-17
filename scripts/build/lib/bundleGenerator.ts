/**
 * Bundle Generator Library
 *
 * Provides functions for generating combined SDK + remote configuration bundles.
 * Downloads pre-built SDK from CDN and fetches remote configuration from Datadog servers.
 */

import https from 'node:https'
import { browserSdkVersion } from '../../lib/browserSdkVersion.ts'

// Re-export types from @datadog/browser-remote-config for consumers
export type { RumRemoteConfiguration, RemoteConfigResult } from '@datadog/browser-remote-config'

/**
 * Supported SDK variants.
 *
 * - `'rum'`: Full SDK with all features (RUM, session replay, profiling)
 * - `'rum-slim'`: Lightweight SDK with core RUM features only
 */
export type SdkVariant = 'rum' | 'rum-slim'

/**
 * Options for fetching remote configuration.
 *
 * @internal Use {@link generateBundle} instead for end-to-end workflow.
 */
export interface FetchConfigOptions {
  applicationId: string
  remoteConfigurationId: string
  site?: string
}

/**
 * Options for the low-level generateCombinedBundle() function.
 */
export interface CombineBundleOptions {
  sdkCode: string
  config: {
    applicationId: string
    [key: string]: unknown
  }
  variant: SdkVariant
}

/**
 * Options for the high-level generateBundle() API function.
 *
 * @property applicationId - Datadog application ID (required). Get this from Datadog UI > RUM > Settings
 * @property remoteConfigurationId - Remote configuration ID (required). Get this from Datadog UI > Remote Configuration
 * @property variant - SDK variant: 'rum' for full SDK, 'rum-slim' for lightweight version
 * @property site - Datadog site (optional, default: 'datadoghq.com'). Use 'datadoghq.eu' for EU region
 * @property datacenter - CDN datacenter for SDK download (optional, default: 'us1')
 */
export interface GenerateBundleOptions {
  applicationId: string
  remoteConfigurationId: string
  variant: SdkVariant
  site?: string
  datacenter?: string
}

// CDN base URL for Datadog Browser SDK bundles
// Format: https://www.datadoghq-browser-agent.com/{datacenter}/v{majorVersion}/datadog-{variant}.js
const CDN_HOST = 'https://www.datadoghq-browser-agent.com'
const DEFAULT_DATACENTER = 'us1'

// In-memory cache for SDK downloads to avoid re-fetching in watch mode
const sdkCache = new Map<string, string>()

/**
 * Get the major version number from a semver string (e.g., "6.26.0" -> 6)
 */
function getMajorVersion(version: string): number {
  const major = parseInt(version.split('.')[0], 10)
  if (isNaN(major)) {
    throw new Error(`Invalid SDK version format: ${version}`)
  }
  return major
}

/**
 * Fetch remote configuration from Datadog servers.
 *
 * Uses the @datadog/browser-remote-config package to fetch and validate configuration.
 *
 * @internal Use {@link generateBundle} instead for end-to-end workflow.
 * @param options - Configuration options including applicationId and remoteConfigurationId
 * @returns Promise resolving to the remote configuration result
 * @throws Error if configuration cannot be fetched or is invalid
 */
export async function fetchConfig(options: FetchConfigOptions): Promise<{
  ok: true
  value: {
    applicationId: string
    [key: string]: unknown
  }
}> {
  // Dynamic import to avoid issues with ESM/CJS interop in Node.js scripts
  // eslint-disable-next-line import/no-extraneous-dependencies
  const { fetchRemoteConfiguration } = await import('@datadog/browser-remote-config')

  const CONFIG_FETCH_TIMEOUT_MS = 30_000
  const result = await Promise.race([
    fetchRemoteConfiguration({
      applicationId: options.applicationId,
      remoteConfigurationId: options.remoteConfigurationId,
      site: options.site,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timeout fetching remote configuration (${CONFIG_FETCH_TIMEOUT_MS}ms)`)),
        CONFIG_FETCH_TIMEOUT_MS
      )
    ),
  ])

  if (!result.ok || !result.value) {
    throw new Error(
      `Failed to fetch remote configuration: ${result.error?.message}\n` +
        `Verify applicationId "${options.applicationId}" and ` +
        `configId "${options.remoteConfigurationId}" are correct.`
    )
  }

  return { ok: true, value: result.value }
}

/**
 * Options for downloading SDK from CDN.
 *
 * @internal Use {@link generateBundle} instead for end-to-end workflow.
 */
export interface DownloadSDKOptions {
  /** SDK variant ('rum' or 'rum-slim') */
  variant: SdkVariant
  /** Datacenter to download from (default: 'us1') */
  datacenter?: string
}

/**
 * Download pre-built SDK bundle from Datadog CDN.
 *
 * Downloads the minified SDK bundle for the specified variant and version.
 * The version is automatically determined from the browserSdkVersion.
 * Results are cached in-memory; repeated calls with the same variant skip the network request.
 *
 * @internal Use {@link generateBundle} instead for end-to-end workflow.
 * @param options - SDK variant string or download options object
 * @returns Promise resolving to SDK JavaScript code as string
 * @throws Error if download fails (network error, 404, timeout)
 */
export async function downloadSDK(options: SdkVariant | DownloadSDKOptions): Promise<string> {
  const variant = typeof options === 'string' ? options : options.variant
  const datacenter = typeof options === 'string' ? DEFAULT_DATACENTER : (options.datacenter ?? DEFAULT_DATACENTER)

  const version = browserSdkVersion
  const majorVersion = getMajorVersion(version)

  const cacheKey = `${variant}-${majorVersion}-${datacenter}`
  const cached = sdkCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const cdnUrl = `${CDN_HOST}/${datacenter}/v${majorVersion}/datadog-${variant}.js`

  const sdkCode = await new Promise<string>((resolve, reject) => {
    const request = https.get(cdnUrl, { timeout: 30000 }, (res) => {
      let data = ''

      if (res.statusCode === 404) {
        reject(
          new Error(
            `SDK bundle not found at ${cdnUrl}\n` +
              `Check that variant "${variant}" (major version: v${majorVersion}) is correct.\n` +
              `Full SDK version: ${version}`
          )
        )
        return
      }

      if (!res.statusCode || res.statusCode >= 400) {
        reject(new Error(`Failed to download SDK from CDN: HTTP ${res.statusCode}\nURL: ${cdnUrl}`))
        return
      }

      res.on('data', (chunk: Buffer | string) => {
        data += String(chunk)
      })

      res.on('end', () => {
        resolve(data)
      })
    })

    request.on('error', (error: Error) => {
      reject(new Error(`Network error downloading SDK from CDN:\nURL: ${cdnUrl}\nError: ${error.message}`))
    })

    request.on('timeout', () => {
      request.destroy()
      reject(new Error(`Timeout downloading SDK from CDN (30s):\nURL: ${cdnUrl}`))
    })
  })

  sdkCache.set(cacheKey, sdkCode)
  return sdkCode
}

/**
 * Generate a combined bundle containing both SDK code and embedded configuration.
 *
 * The output is a single JavaScript file wrapped in an IIFE that:
 * 1. Defines the embedded configuration
 * 2. Includes the SDK code
 * 3. Auto-initializes the SDK with the embedded config
 *
 * @internal Use {@link generateBundle} instead for end-to-end workflow.
 * @param options - Bundle generation options (sdkCode, config, variant)
 * @returns Generated JavaScript bundle as string
 */
export function generateCombinedBundle(options: CombineBundleOptions): string {
  const { sdkCode, config, variant } = options

  // Use JSON.stringify for deterministic serialization
  // Note: config may contain dynamic values (cookies, DOM selectors)
  // that will be resolved at runtime by the SDK's resolveDynamicValues()
  const configJson = JSON.stringify(config, null, 2)

  return `/**
 * Datadog Browser SDK with Embedded Remote Configuration
 * SDK Variant: ${variant}
 * SDK Version: ${browserSdkVersion}
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
    window.DD_RUM.init(__DATADOG_REMOTE_CONFIG__);
  }
})();
`
}

const VALID_VARIANTS: SdkVariant[] = ['rum', 'rum-slim']

/**
 * Generate a browser-ready bundle combining SDK and embedded remote configuration.
 *
 * Downloads the Datadog Browser SDK and fetches remote configuration, then combines
 * them into a single JavaScript file that initializes the SDK without additional
 * network requests.
 *
 * @param options - Configuration options for bundle generation
 * @returns Promise resolving to the generated JavaScript bundle as a string
 * @example
 * ```typescript
 * import { generateBundle } from './bundleGenerator'
 *
 * const bundle = await generateBundle({
 *   applicationId: 'your-app-id',
 *   remoteConfigurationId: 'your-config-id',
 *   variant: 'rum'
 * })
 *
 * await writeFile('./datadog-bundle.js', bundle)
 * ```
 */
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

/**
 * Clear the in-memory SDK cache. Exported for testing only.
 *
 * @internal
 */
export function clearSdkCache(): void {
  sdkCache.clear()
}
