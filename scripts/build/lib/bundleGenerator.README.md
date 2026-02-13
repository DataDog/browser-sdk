# Datadog Browser SDK Bundle Generator API

Generate pre-configured Datadog Browser SDK bundles with embedded remote configuration for zero-request SDK initialization.

## Quick Start

```typescript
import { generateBundle } from './bundleGenerator'
import { writeFile } from 'node:fs/promises'

const bundle = await generateBundle({
  applicationId: 'your-app-id',
  remoteConfigurationId: 'your-config-id',
  variant: 'rum'
})

await writeFile('./datadog-bundle.js', bundle)
```

## API Reference

### `generateBundle(options): Promise<string>`

Generate a browser-ready bundle combining SDK and embedded remote configuration.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `applicationId` | `string` | Yes | Datadog application ID |
| `remoteConfigurationId` | `string` | Yes | Remote configuration ID |
| `variant` | `'rum' \| 'rum-slim'` | Yes | SDK variant (full or lightweight) |
| `site` | `string` | No | Datadog site (default: `'datadoghq.com'`, use `'datadoghq.eu'` for EU) |
| `datacenter` | `string` | No | CDN datacenter (default: `'us1'`) |

**Returns:** `Promise<string>` — Generated JavaScript bundle

**Errors:**

| Error | Cause | Solution |
|-------|-------|----------|
| `applicationId is required` | Missing required parameter | Provide your Datadog application ID from RUM > Settings |
| `Invalid variant` | variant is not `'rum'` or `'rum-slim'` | Use one of the two supported variants |
| `Failed to fetch remote configuration` | Config ID invalid or doesn't exist | Verify `remoteConfigurationId` in Datadog UI > Remote Configuration |
| `SDK bundle not found` | Invalid variant or SDK version | Check variant spelling and ensure SDK version is available |

## Build Tool Integration Examples

### Raw Node.js

The simplest integration: run a Node.js script before your main build.

```typescript
// scripts/generate-datadog-bundle.ts
import { generateBundle } from '../path/to/bundleGenerator'
import { writeFile } from 'node:fs/promises'

const bundle = await generateBundle({
  applicationId: process.env.DATADOG_APP_ID!,
  remoteConfigurationId: process.env.DATADOG_CONFIG_ID!,
  variant: 'rum'
})

await writeFile('./public/datadog-rum.js', bundle)
console.log('Datadog bundle generated')
```

Add to `package.json`:

```json
{
  "scripts": {
    "prebuild": "tsx scripts/generate-datadog-bundle.ts",
    "build": "webpack"
  }
}
```

Include in HTML:

```html
<script src="/datadog-rum.js"></script>
```

### Webpack Plugin

```typescript
import { generateBundle, type GenerateBundleOptions } from '../path/to/bundleGenerator'

class DatadogBundlePlugin {
  constructor(private options: GenerateBundleOptions) {}

  apply(compiler) {
    compiler.hooks.emit.tapPromise('DatadogBundlePlugin', async (compilation) => {
      const bundle = await generateBundle(this.options)
      compilation.assets['datadog-rum-bundle.js'] = {
        source: () => bundle,
        size: () => bundle.length,
      }
    })
  }
}

// webpack.config.js
module.exports = {
  plugins: [
    new DatadogBundlePlugin({
      applicationId: process.env.DATADOG_APP_ID,
      remoteConfigurationId: process.env.DATADOG_CONFIG_ID,
      variant: 'rum'
    })
  ]
}
```

### Vite Integration

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { generateBundle } from '../path/to/bundleGenerator'
import { writeFile } from 'node:fs/promises'

export default defineConfig({
  plugins: [
    {
      name: 'datadog-bundle',
      async buildStart() {
        const bundle = await generateBundle({
          applicationId: process.env.DATADOG_APP_ID!,
          remoteConfigurationId: process.env.DATADOG_CONFIG_ID!,
          variant: 'rum'
        })
        await writeFile('./public/datadog-rum.js', bundle)
      }
    }
  ]
})
```

## Configuration

### Getting Your IDs

**Application ID:**
1. Go to Datadog UI > Real User Monitoring > Settings
2. Copy the Application ID

**Configuration ID:**
1. Go to Datadog UI > Remote Configuration
2. Create or select a configuration
3. Copy the Configuration ID

### Variants

| Variant | Size | Features |
|---------|------|----------|
| `rum` | ~100KB minified | RUM collection, session replay, profiling |
| `rum-slim` | ~50KB minified | Core RUM collection only |

## Performance

### Caching

SDK downloads are cached in-memory within a Node.js process. Repeated calls with the same variant are served from cache (<5ms instead of ~500ms network request).

```typescript
// First call: downloads from CDN (~500ms)
const bundle1 = await generateBundle({ ... })

// Second call: returns from cache (<5ms)
const bundle2 = await generateBundle({ ... })
```

Cache is automatically cleared when the Node.js process exits.

## Dynamic Configuration Values

Remote configuration can include dynamic values that are resolved at browser runtime:

- **Cookies:** Extract values from `document.cookie`
- **DOM:** Extract values from page HTML elements
- **JavaScript:** Access values from the `window` object

These dynamic values are embedded as-is in the generated bundle. The SDK resolves them at runtime when it initializes.

## Testing

```bash
# Unit tests
yarn test:script

# E2E tests (verify SDK works with embedded config)
yarn test:e2e -g "embedded configuration"
```

## Troubleshooting

**SDK doesn't load on page:**
Check the script tag is loading, verify the bundle is valid JavaScript in the DevTools console, and check the browser console for SDK initialization errors.

**Configuration not being used:**
Verify the bundle is loaded before page initialization. Check that the embedded config in the bundle matches your settings and that `DD_RUM` is available globally after the bundle loads.

**Network request to config endpoint still happening:**
This indicates the SDK is not using the embedded config. Verify the bundle was generated with your config ID and that the bundle is being loaded (not a fallback SDK).
