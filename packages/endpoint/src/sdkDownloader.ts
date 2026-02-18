// eslint-disable-next-line local-rules/disallow-side-effects, local-rules/enforce-prod-deps-imports -- Node.js build tool
import https from 'node:https'
// eslint-disable-next-line local-rules/disallow-side-effects, local-rules/enforce-prod-deps-imports -- Node.js build tool
import { createRequire } from 'node:module'

export type SdkVariant = 'rum' | 'rum-slim'

export interface DownloadSDKOptions {
  variant: SdkVariant
  datacenter?: string
  version?: string
}

const CDN_HOST = 'https://www.datadoghq-browser-agent.com'
const DEFAULT_DATACENTER = 'us1'

const sdkCache = new Map<string, string>()

function getDefaultVersion(): string {
  const require = createRequire(import.meta.url)
  const pkg = require('@datadog/browser-remote-config/package.json') as { version: string }
  return pkg.version
}

function getMajorVersion(version: string): number {
  const major = parseInt(version.split('.')[0], 10)
  if (isNaN(major)) {
    throw new Error(`Invalid SDK version format: ${version}`)
  }
  return major
}

export async function downloadSDK(options: SdkVariant | DownloadSDKOptions): Promise<string> {
  const variant = typeof options === 'string' ? options : options.variant
  const datacenter = typeof options === 'string' ? DEFAULT_DATACENTER : (options.datacenter ?? DEFAULT_DATACENTER)
  const version = typeof options === 'string' ? getDefaultVersion() : (options.version ?? getDefaultVersion())
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

export function clearSdkCache(): void {
  sdkCache.clear()
}
