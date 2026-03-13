/**
 * Demo: @datadog/browser-sdk-endpoint as a dynamic Express endpoint
 *
 * Run with: yarn demo:endpoint
 * Open: http://localhost:3042
 *
 * Endpoint: GET /datadog-sdk.js?applicationId=xxx&remoteConfigurationId=yyy&variant=rum&sdkVersion=6.28.0
 *
 * - Accepts any applicationId + remoteConfigurationId combination
 * - Fetches the RC on the fly and generates a self-contained bundle
 * - sdkVersion (optional) — pin a specific SDK version from CDN; defaults to the package version
 * - Caches per (applicationId, remoteConfigurationId, variant, sdkVersion) key for 5 minutes
 * - SDK downloaded from CDN once per version and cached in memory across all requests
 */

import * as http from 'node:http'
import express from 'express'
import { generateCombinedBundle } from '../packages/endpoint/src/bundleGenerator.ts'
import { resolveDynamicValues, serializeConfigToJs } from '../packages/remote-config/src/entries/node.ts'
import { downloadSDK, getDefaultVersion, type SdkVariant } from '../packages/endpoint/src/sdkDownloader.ts'

const PORT = 3042
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const VALID_VARIANTS: SdkVariant[] = ['rum', 'rum-slim', 'logs', 'rum-and-logs']

// ---------------------------------------------------------------------------
// Per-key bundle cache + inflight deduplication
// ---------------------------------------------------------------------------

interface CacheEntry {
  bundle: string
  expiry: number
}

const bundleCache = new Map<string, CacheEntry>()
const inflightMap = new Map<string, Promise<string>>()

function cacheKey(
  applicationId: string,
  remoteConfigurationId: string,
  variant: SdkVariant,
  sdkVersion: string
): string {
  return `${applicationId}::${remoteConfigurationId}::${variant}::${sdkVersion}`
}

async function buildBundle(
  applicationId: string,
  remoteConfigurationId: string,
  variant: SdkVariant,
  sdkVersion: string
): Promise<string> {
  const start = Date.now()
  console.log(`[endpoint] Generating bundle for rc=${remoteConfigurationId} variant=${variant} version=${sdkVersion}`)

  // Fetch the RC config for this specific remoteConfigurationId
  const rcResp = await fetch(
    `https://sdk-configuration.browser-intake-datadoghq.com/v1/${encodeURIComponent(remoteConfigurationId)}.json`
  )
  if (!rcResp.ok) {
    throw new Error(
      `RC fetch failed with status ${rcResp.status}. ` +
        `Verify remoteConfigurationId "${remoteConfigurationId}" is correct.`
    )
  }
  const rcJson = (await rcResp.json()) as { rum?: Record<string, unknown> }
  if (!rcJson.rum) {
    throw new Error(`No rum configuration found for remoteConfigurationId "${remoteConfigurationId}".`)
  }

  // Merge applicationId into the config (RC payload may not include it)
  const rc = { applicationId, ...rcJson.rum }

  // Code-gen: resolve DynamicOptions into inline JS expressions
  const resolved = resolveDynamicValues(rc)
  const configJs = serializeConfigToJs(resolved)

  // Download SDK from CDN — sdkDownloader caches in memory per version
  const sdkCode = await downloadSDK({ variant, version: sdkVersion })

  const bundle = generateCombinedBundle({ sdkCode, configJs, variant, sdkVersion })
  console.log(`[endpoint] Bundle ready in ${Date.now() - start}ms (${bundle.length} bytes)`)
  return bundle
}

async function getBundle(
  applicationId: string,
  remoteConfigurationId: string,
  variant: SdkVariant,
  sdkVersion: string
): Promise<string> {
  const key = cacheKey(applicationId, remoteConfigurationId, variant, sdkVersion)

  const cached = bundleCache.get(key)
  if (cached && Date.now() < cached.expiry) {
    console.log(`[endpoint] Cache hit for key=${key}`)
    return cached.bundle
  }

  // Deduplicate concurrent requests for the same key
  const inflight = inflightMap.get(key)
  if (inflight) return inflight

  const promise = buildBundle(applicationId, remoteConfigurationId, variant, sdkVersion)
    .then((bundle) => {
      bundleCache.set(key, { bundle, expiry: Date.now() + CACHE_TTL_MS })
      inflightMap.delete(key)
      return bundle
    })
    .catch((err) => {
      inflightMap.delete(key)
      throw err
    })

  inflightMap.set(key, promise)
  return promise
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express()

/**
 * Dynamic SDK bundle endpoint.
 *
 * Query params:
 *   applicationId          — Datadog application ID (required)
 *   remoteConfigurationId  — RC config ID from Datadog UI (required)
 *   variant                — 'rum' (default) or 'rum-slim' (optional)
 *   sdkVersion             — SDK version to fetch from CDN e.g. '6.28.0' (optional, defaults to package version)
 *
 * Example:
 *   /datadog-sdk.js?applicationId=d717cc88-...&remoteConfigurationId=e242d141-...&sdkVersion=6.28.0
 */
app.get('/datadog-sdk.js', async (req, res) => {
  const {
    applicationId,
    remoteConfigurationId,
    variant = 'rum',
    sdkVersion = getDefaultVersion(),
  } = req.query as Record<string, string>

  if (!applicationId) {
    res.status(400).send('/* Missing required query param: applicationId */')
    return
  }
  if (!remoteConfigurationId) {
    res.status(400).send('/* Missing required query param: remoteConfigurationId */')
    return
  }
  if (!VALID_VARIANTS.includes(variant as SdkVariant)) {
    res.status(400).send(`/* Invalid variant "${variant}". Must be "rum" or "rum-slim" */`)
    return
  }

  try {
    const bundle = await getBundle(applicationId, remoteConfigurationId, variant as SdkVariant, sdkVersion)
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.send(bundle)
  } catch (err) {
    console.error('[endpoint] Bundle generation failed:', err)
    res.status(500).send(`/* Bundle generation failed: ${String(err)} */`)
  }
})

// Demo HTML page — loads the bundle using the sandbox credentials
app.get('/', (_req, res) => {
  const appId = 'd717cc88-ced7-4830-a377-14433a5c7bb0'
  const rcId = 'e242d141-e05f-4814-981a-29e0c407050b'
  const bundleUrl = `/datadog-sdk.js?applicationId=${appId}&remoteConfigurationId=${rcId}`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Endpoint Demo</title>
  <script>
    window.__DD_BASE_CONFIG__ = { clientToken: 'pubc39120f567244fa8ef1ae89b8372cab5', site: 'datadoghq.com' }
    window.user = 'sandbox-user-123'
  </script>
  <script src="${bundleUrl}"></script>
</head>
<body>
  <h2>Dynamic Endpoint Demo</h2>
  <p>Bundle URL: <code>${bundleUrl}</code></p>
  <p>Any <code>applicationId</code> + <code>remoteConfigurationId</code> combination works — each gets its own cached bundle.</p>
  <h3>Applied configuration:</h3>
  <pre id="config">Loading...</pre>
  <script>
    window.addEventListener('load', () => {
      document.getElementById('config').textContent =
        JSON.stringify(window.DD_RUM?.getInitConfiguration(), null, 2)
    })
  </script>
</body>
</html>`)
})

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

const server = http.createServer(app)
server.listen(PORT, () => {
  console.log(`[endpoint] Server running at http://localhost:${PORT}`)
  console.log(`[endpoint] Try: GET /datadog-sdk.js?applicationId=<id>&remoteConfigurationId=<id>`)
})
