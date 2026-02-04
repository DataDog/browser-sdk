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
 * SDK variant types supported by the generator
 */
export type SdkVariant = 'rum' | 'rum-slim'

/**
 * Options for fetching remote configuration
 */
export interface FetchConfigOptions {
  applicationId: string
  remoteConfigurationId: string
  site?: string
}

/**
 * Options for generating combined bundle
 */
export interface GenerateBundleOptions {
  sdkCode: string
  config: {
    applicationId: string
    [key: string]: unknown
  }
  variant: SdkVariant
}

// CDN base URL for Datadog Browser SDK bundles
// Format: https://www.datadoghq-browser-agent.com/{datacenter}/v{majorVersion}/datadog-{variant}.js
const CDN_HOST = 'https://www.datadoghq-browser-agent.com'
const DEFAULT_DATACENTER = 'us1'

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
 * @param options - Configuration options including applicationId and remoteConfigurationId
 * @returns Promise resolving to the remote configuration
 * @throws Error if configuration cannot be fetched or is invalid
 */
export async function fetchConfig(options: FetchConfigOptions): Promise<{
  ok: boolean
  value?: {
    applicationId: string
    [key: string]: unknown
  }
  error?: Error
}> {
  // Dynamic import to avoid issues with ESM/CJS interop in Node.js scripts
  const { fetchRemoteConfiguration } = await import('@datadog/browser-remote-config')

  const result = await fetchRemoteConfiguration({
    applicationId: options.applicationId,
    remoteConfigurationId: options.remoteConfigurationId,
    site: options.site,
  })

  if (!result.ok) {
    throw new Error(
      `Failed to fetch remote configuration: ${result.error?.message}\n` +
        `Verify applicationId "${options.applicationId}" and ` +
        `configId "${options.remoteConfigurationId}" are correct.`
    )
  }

  return result
}

/**
 * Options for downloading SDK from CDN
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
 *
 * @param options - Download options (variant, datacenter)
 * @returns Promise resolving to SDK JavaScript code as string
 * @throws Error if download fails (network error, 404, etc.)
 */
export async function downloadSDK(options: SdkVariant | DownloadSDKOptions): Promise<string> {
  const variant = typeof options === 'string' ? options : options.variant
  const datacenter = typeof options === 'string' ? DEFAULT_DATACENTER : (options.datacenter ?? DEFAULT_DATACENTER)

  const version = browserSdkVersion
  const majorVersion = getMajorVersion(version)
  const cdnUrl = `${CDN_HOST}/${datacenter}/v${majorVersion}/datadog-${variant}.js`

  return new Promise((resolve, reject) => {
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
        reject(new Error(`Failed to download SDK from CDN: HTTP ${res.statusCode}\n` + `URL: ${cdnUrl}`))
        return
      }

      res.on('data', (chunk: Buffer | string) => {
        data += chunk
      })

      res.on('end', () => {
        resolve(data)
      })
    })

    request.on('error', (error: Error) => {
      reject(new Error(`Network error downloading SDK from CDN:\n` + `URL: ${cdnUrl}\n` + `Error: ${error.message}`))
    })

    request.on('timeout', () => {
      request.destroy()
      reject(new Error(`Timeout downloading SDK from CDN (30s):\n` + `URL: ${cdnUrl}`))
    })
  })
}

/**
 * Generate a combined bundle containing both SDK code and embedded configuration.
 *
 * The output is a single JavaScript file wrapped in an IIFE that:
 * 1. Defines the embedded configuration
 * 2. Includes the SDK code
 * 3. Auto-initializes the SDK with the embedded config
 *
 * @param options - Bundle generation options
 * @returns Generated JavaScript bundle as string
 */
export function generateCombinedBundle(options: GenerateBundleOptions): string {
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
