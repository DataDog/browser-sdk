# Remote Config Proxy for Browser Live Debugger

A Node.js proxy service that enables browser Live Debugger to receive probe configurations from Datadog Remote Config, similar to how the Datadog Agent proxies RC for backend tracers.

## Architecture

This proxy implements the same client-tracking pattern as the Datadog Agent:

1. **Browser clients** poll `/probes?service=my-app&env=prod&version=1.0.0` every 5 seconds
2. **Proxy tracks** active clients with a 30-second TTL
3. **Proxy polls** Datadog RC backend every 5 seconds, including all active clients
4. **Proxy returns** LIVE_DEBUGGING probes to browsers

This allows multiple browser applications to share a single proxy, just like backend services share the Datadog Agent.

## Features

- ✅ **Dynamic Client Tracking**: Automatically tracks active browser clients by service/env/version
- ✅ **Protobuf Protocol**: Full Remote Config protocol implementation
- ✅ **LIVE_DEBUGGING Only**: Hardcoded to only request and serve LIVE_DEBUGGING product (security)
- ✅ **TTL-based Expiration**: Clients expire after 30 seconds of inactivity
- ✅ **Background Polling**: Continuously polls RC backend when clients are active
- ✅ **CORS Enabled**: Allows browser access from any origin
- ✅ **Health Monitoring**: Status endpoint for monitoring

## Setup

### 1. Install Dependencies

```bash
cd sandbox/rc-proxy
npm install
```

### 2. Configure Environment

Copy the example environment file and configure your API key:

```bash
cp .env.example .env
```

Then edit `.env` and set your `DD_API_KEY`. See `.env.example` for all available configuration options.

### 3. Run the Proxy

```bash
npm start
```

The proxy will start on `http://localhost:3030`.

## API Endpoints

### GET /probes

Register a client and fetch probes for it.

**Query Parameters:**
- `service` (required): Service name
- `env` (optional): Environment (e.g., `prod`, `staging`)
- `version` (optional): Application version

**Example:**
```bash
curl "http://localhost:3030/probes?service=my-app&env=prod&version=1.0.0"
```

**Response:**
```json
{
  "probes": [
    {
      "id": "probe-uuid",
      "type": "LOG_PROBE",
      "where": { "typeName": "MyClass", "methodName": "myMethod" },
      ...
    }
  ],
  "count": 1,
  "lastPollTime": "2024-01-01T00:00:00.000Z"
}
```

### GET /health

Get proxy status and health information.

**Example:**
```bash
curl http://localhost:3030/health
```

**Response:**
```json
{
  "ok": true,
  "lastPollTime": "2024-01-01T00:00:00.000Z",
  "lastPollError": null,
  "activeClientCount": 2,
  "probeCount": 5,
  "config": {
    "site": "datadoghq.com",
    "pollInterval": 5000,
    "clientTTL": 30000
  }
}
```

### GET /

Get proxy information and available endpoints.

## How It Works

### Client Tracking

When a browser calls `/probes?service=my-app`, the proxy:

1. Registers/updates the client with current timestamp
2. Assigns a unique `runtime_id` to the client
3. Tracks the client's service, env, and version
4. Returns probes from the cache

Clients must call `/probes` at least once every 30 seconds to stay active.

### Remote Config Polling

Every 5 seconds, the proxy:

1. Gets all active (non-expired) clients
2. Builds a protobuf `LatestConfigsRequest` with all active clients
3. POSTs to `https://config.datadoghq.com/api/v0.1/configurations`
4. Parses the protobuf `LatestConfigsResponse`
5. Extracts LIVE_DEBUGGING probes from target files
6. Updates the probe cache

If no clients are active, the proxy skips the RC poll to save resources.

## Integration with Browser SDK

Initialize the Live Debugger with the proxy URL:

```javascript
import { datadogLiveDebugger } from '@datadog/browser-live-debugger';

datadogLiveDebugger.init({
  clientToken: '<DATADOG_CLIENT_TOKEN>',
  site: 'datadoghq.com',
  service: 'my-browser-app',
  env: 'production',
  version: '1.0.0',
  remoteConfigProxyUrl: 'http://localhost:3030'
});
```

The SDK will automatically:
- Poll `/probes` every 5 seconds with service metadata
- Add new probes dynamically
- Remove probes that are no longer configured
- Handle probe version updates

## Troubleshooting

### "No active clients, skipping RC poll"

This is normal when no browsers are connected. The proxy will resume polling when a browser calls `/probes`.

### "RC backend returned 401"

Check that your `DD_API_KEY` is valid and has the Remote Config scope enabled.

### "RC backend returned 404"

Remote Config might not be enabled for your organization. Contact Datadog support.

### Probes not appearing in browser

1. Check the `/health` endpoint to see if probes are in the cache
2. Verify the browser is sending the correct `service` name
3. Check browser console for polling errors
4. Ensure probes are configured in Datadog for your service

## Security Notes

- This proxy is **hardcoded to LIVE_DEBUGGING only** for security
- The proxy exposes CORS to all origins (intended for local development)
- For production use, you should:
  - Add authentication to the proxy endpoints
  - Restrict CORS to specific origins
  - Use HTTPS
  - Deploy behind a proper security layer

## Development

### Running in Development Mode

```bash
npm run dev
```

This uses Node's `--watch` flag to restart on file changes.

### Project Structure

```
sandbox/rc-proxy/
├── index.js           # Main Express server
├── rc-client.js       # Remote Config protocol client
├── client-tracker.js  # Active client tracking with TTL
├── config.js          # Environment configuration
├── remoteconfig.proto # Protobuf schema
├── package.json       # Dependencies
├── .env              # Environment variables (not committed)
└── README.md         # This file
```

## Technical Details

- **Protocol**: Uses Datadog's Remote Config protobuf protocol
- **Products**: Hardcoded to `['LIVE_DEBUGGING']`
- **Client ID**: Each browser client gets a unique UUID
- **Version Tracking**: Tracks RC versions to minimize data transfer
- **Probe Format**: Compatible with dd-trace-js debugger probe format

## License

Apache-2.0

