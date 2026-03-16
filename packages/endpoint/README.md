# @datadog/browser-sdk-endpoint

Node.js package for generating self-contained Datadog Browser SDK bundles with embedded remote configuration. Designed for CI/CD pipelines, SSR frameworks, and custom build tooling.

## Installation

```bash
npm install @datadog/browser-sdk-endpoint
```

## Usage

### Generate a bundle (CI / build script)

Fetch remote configuration, download the SDK from CDN, and produce a single self-executing IIFE in one call:

```typescript
import { generateBundle } from '@datadog/browser-sdk-endpoint'
import { writeFileSync } from 'node:fs'

const bundle = await generateBundle({
  applicationId: 'your-app-id',
  remoteConfigurationId: 'your-config-id',
  variant: 'rum',          // 'rum' | 'rum-slim' | 'logs' | 'rum-and-logs'
  site: 'datadoghq.com',   // optional, defaults to datadoghq.com
})

writeFileSync('public/datadog-sdk.js', bundle)
```

Then in your HTML, set `window.__DD_BASE_CONFIG__` with the fields that belong to the page (not the remote config) before loading the bundle:

```html
<script>
  window.__DD_BASE_CONFIG__ = {
    clientToken: 'your-client-token',
    site: 'datadoghq.com'
  }
</script>
<script src="/datadog-sdk.js"></script>
```

The bundle merges `__DD_BASE_CONFIG__` with the embedded remote configuration and calls `DD_RUM.init()` automatically — no additional `init()` call needed in your app code.

### SSR: inject configuration at render time

If you use server-side rendering and want to avoid a separate bundle generation step, you can fetch the remote configuration per request, serialize it to an inline JS expression, and inject it into the HTML response. The SDK is loaded separately; only the configuration is embedded.

```typescript
import { fetchRemoteConfiguration } from '@datadog/browser-remote-config'
import { resolveDynamicValues, serializeConfigToJs } from '@datadog/browser-remote-config/node'

// In your SSR handler (Express, Next.js getServerSideProps, etc.)
const result = await fetchRemoteConfiguration({
  applicationId: 'your-app-id',
  remoteConfigurationId: 'your-config-id',
})

if (result.ok) {
  const configJs = serializeConfigToJs(resolveDynamicValues(result.value))

  // Inject into <head> before the SDK script tag
  // configJs is a JS object literal — dynamic values (cookies, DOM, window.*) are
  // serialized as inline expressions that evaluate in the browser at page load time
  html += `<script>window.__DD_RC_CONFIG__ = ${configJs}</script>`
}
```

Then in your client-side code:

```typescript
import { datadogRum } from '@datadog/browser-rum'

datadogRum.init({
  applicationId: 'your-app-id',
  clientToken: 'your-client-token',
  site: 'datadoghq.com',
  ...window.__DD_RC_CONFIG__
})
```

`resolveDynamicValues` from the Node entry point serializes `DynamicOption` fields (cookie, JS path, DOM, localStorage) as inline JS expressions rather than evaluating them on the server. Those expressions run against live browser APIs when the `<script>` tag is parsed, so dynamic values like a cookie-based user ID are resolved at the right time.

### Build blocks (advanced)

Use `fetchConfig`, `generateCombinedBundle`, and `downloadSDK` separately for custom pipelines:

```typescript
import { fetchConfig, generateCombinedBundle } from '@datadog/browser-sdk-endpoint'
import { resolveDynamicValues, serializeConfigToJs } from '@datadog/browser-remote-config/node'
import { downloadSDK } from '@datadog/browser-sdk-endpoint'

const configResult = await fetchConfig({
  applicationId: 'your-app-id',
  remoteConfigurationId: 'your-config-id',
})

const configJs = serializeConfigToJs(resolveDynamicValues(configResult.value))
const sdkCode = await downloadSDK({ variant: 'rum' })

const bundle = generateCombinedBundle({ sdkCode, configJs, variant: 'rum' })
```

## API

### `generateBundle(options)`

Fetches remote configuration, downloads the SDK from CDN, and returns a combined bundle string.

- `applicationId` (string, required)
- `remoteConfigurationId` (string, required)
- `variant` (`'rum' | 'rum-slim' | 'logs' | 'rum-and-logs'`, required)
- `site` (string, optional) — Datadog site, e.g. `'datadoghq.eu'`
- `datacenter` (string, optional) — CDN datacenter, e.g. `'us1'`

### `fetchConfig(options)`

Fetches and validates remote configuration. Throws on network error or invalid config ID.

- `applicationId`, `remoteConfigurationId`, `site` — same as above

### `generateCombinedBundle(options)`

Assembles a self-executing IIFE from pre-fetched parts.

- `sdkCode` (string) — SDK source downloaded from CDN
- `configJs` (string) — serialized config from `serializeConfigToJs`
- `variant` — SDK variant label embedded in the bundle comment
- `sdkVersion` (string, optional) — version label embedded in the bundle comment

### `downloadSDK(options)`

Downloads the SDK bundle from the Datadog CDN. Results are cached in memory per variant + datacenter.

- `variant`, `datacenter`, `version` (optional — defaults to the package version)
