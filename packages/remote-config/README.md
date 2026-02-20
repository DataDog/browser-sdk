# @datadog/browser-remote-config

Lightweight package for fetching and parsing Datadog Remote Configuration for the Browser RUM SDK.

## Overview

This package provides utilities to fetch and parse remote configurations from Datadog, allowing you to manage RUM SDK settings remotely without needing to redeploy your application.

## Installation

```bash
npm install @datadog/browser-remote-config
```

## Usage

### Basic Example

```typescript
import { fetchRemoteConfiguration } from '@datadog/browser-remote-config'

const result = await fetchRemoteConfiguration({
  applicationId: 'your-app-id',
  remoteConfigurationId: 'your-remote-config-id',
})

if (result.ok) {
  console.log('Remote config loaded:', result.value)
  // Use result.value to configure your SDK
} else {
  console.error('Failed to load remote config:', result.error)
}
```

### Integration with Datadog RUM

```typescript
import { fetchRemoteConfiguration } from '@datadog/browser-remote-config'
import { datadogRum } from '@datadog/browser-rum'

// Fetch remote configuration
const remoteConfigResult = await fetchRemoteConfiguration({
  applicationId: 'your-app-id',
  remoteConfigurationId: 'your-remote-config-id',
})

// Merge with local configuration
const config = {
  applicationId: 'your-app-id',
  clientToken: 'your-client-token',
  site: 'datadoghq.com',
  // ... other config options
}

if (remoteConfigResult.ok && remoteConfigResult.value?.rum) {
  // Merge remote configuration fields
  Object.assign(config, remoteConfigResult.value.rum)
}

// Initialize SDK with merged configuration
datadogRum.init(config)
datadogRum.startSessionReplayRecording()
```

### Using Custom Proxy

If you need to route requests through a custom proxy:

```typescript
const result = await fetchRemoteConfiguration({
  applicationId: 'your-app-id',
  remoteConfigurationId: 'your-remote-config-id',
  remoteConfigurationProxy: 'https://your-proxy.com/config',
})
```

## API Reference

### `fetchRemoteConfiguration(options)`

Fetches remote configuration from Datadog servers.

**Parameters:**

- `applicationId` (string): Your Datadog application ID
- `remoteConfigurationId` (string): The ID of the remote configuration
- `remoteConfigurationProxy` (string, optional): Custom proxy URL
- `site` (string, optional): Datadog site ('datadoghq.com', 'datadoghq.eu', etc.)

**Returns:** Promise<RemoteConfigResult>

```typescript
type RemoteConfigResult = { ok: true; value: RumRemoteConfiguration } | { ok: false; error: Error }
```

### `buildEndpoint(options)`

Constructs the endpoint URL for remote configuration fetch.

**Parameters:**

- Same as `fetchRemoteConfiguration`

**Returns:** string (the endpoint URL)

### `resolveDynamicValues(configValue, options)`

Advanced function to resolve dynamic configuration values (cookies, DOM selectors, JS paths).

Used internally for processing remote configuration with dynamic sources.

## Remote Configuration Format

Remote configurations support static values and dynamic sources:

### Static Values

```json
{
  "rum": {
    "sessionSampleRate": 100,
    "env": "production"
  }
}
```

### Dynamic Values from Cookies

```json
{
  "rum": {
    "version": {
      "rcSerializedType": "dynamic",
      "strategy": "cookie",
      "name": "app_version"
    }
  }
}
```

### Dynamic Values from DOM

```json
{
  "rum": {
    "env": {
      "rcSerializedType": "dynamic",
      "strategy": "dom",
      "selector": "[data-env]",
      "attribute": "data-env"
    }
  }
}
```

### Dynamic Values from JavaScript

```json
{
  "rum": {
    "version": {
      "rcSerializedType": "dynamic",
      "strategy": "js",
      "path": "window.APP.version"
    }
  }
}
```

### Value Extraction with Regex

```json
{
  "rum": {
    "version": {
      "rcSerializedType": "dynamic",
      "strategy": "cookie",
      "name": "version_string",
      "extractor": {
        "rcSerializedType": "regex",
        "value": "v(\\d+\\.\\d+\\.\\d+)"
      }
    }
  }
}
```

## Supported Configuration Fields

The following fields can be set via remote configuration:

- `applicationId` - The RUM application ID
- `service` - Service name
- `env` - Environment
- `version` - Version (supports dynamic resolution)
- `sessionSampleRate` - Session sample rate (0-100)
- `sessionReplaySampleRate` - Session replay sample rate (0-100)
- `defaultPrivacyLevel` - Default privacy level for session replay
- `enablePrivacyForActionName` - Enable privacy for action names
- `traceSampleRate` - Trace sample rate (0-100)
- `trackSessionAcrossSubdomains` - Track sessions across subdomains
- `allowedTracingUrls` - URLs where tracing is allowed
- `allowedTrackingOrigins` - Origins where tracking is allowed
- `user` - User context (supports dynamic resolution)
- `context` - Global context (supports dynamic resolution)

## License

Apache 2.0
