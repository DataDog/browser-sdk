# Quick Start Guide - RC Proxy for Browser Live Debugger

## What's Been Implemented

A complete Remote Config proxy system for browser Live Debugger consisting of:

### 1. RC Proxy Service (`sandbox/rc-proxy/`)
- **Client Tracker**: Tracks active browser clients with 30s TTL (like Datadog Agent)
- **RC Client**: Communicates with Datadog RC backend using protobuf
- **Express Server**: Serves probes via HTTP GET endpoints
- **Background Polling**: Automatically polls RC when clients are active

### 2. Browser SDK Integration (`packages/live-debugger/`)
- **Remote Config Module**: Polls proxy and syncs probes automatically
- **Init Configuration**: Added `remoteConfigProxyUrl` option
- **Probe Synchronization**: Adds, removes, and updates probes dynamically

### 3. Test Page (`sandbox/live-debugger-rc-proxy-test.html`)
- Simple UI to test the RC proxy integration
- Shows active probes, proxy health, and fired probes
- Test functions to trigger instrumented code

## Getting Started

### Step 1: Set Up the RC Proxy

```bash
cd sandbox/rc-proxy

# Install dependencies
npm install

# Copy the example env file and add your API key
cp .env.example .env
# Then edit .env and set your DD_API_KEY
```

### Step 2: Start the RC Proxy

```bash
npm start
```

The proxy will start on http://localhost:3030

You should see:
```
✅ Server running on port 3030
   - Probes endpoint: http://localhost:3030/probes?service=my-app
   - Health endpoint: http://localhost:3030/health
   - Info endpoint: http://localhost:3030/

[Polling] Starting background polling (interval: 5000ms)
[Polling] No active clients, skipping RC poll
```

### Step 3: Configure Probes in Datadog

1. Go to Datadog Live Debugger UI
2. Create probes for service: `browser-test-app`
3. Target JavaScript functions (e.g., `testFunction1`, `testFunction2`)

### Step 4: Build the Browser SDK

```bash
cd /path/to/browser-sdk
yarn build:bundle:live-debugger
```

This creates `packages/live-debugger/bundle/live-debugger.js`

### Step 5: Open the Test Page

Open `sandbox/live-debugger-rc-proxy-test.html` in your browser.

The page will:
- Initialize Live Debugger with RC proxy URL
- Start polling the proxy every 5 seconds
- Display active probes from Datadog
- Show when probes fire

### Step 6: Test the Integration

1. **Check Proxy Health**: Click "Check Proxy Health" to see proxy status
2. **View Probes**: Click "Refresh Probes" to see current probes from RC
3. **Trigger Functions**: Click test function buttons to fire probes
4. **Monitor Logs**: Watch console log for probe firing events

## How It Works

```
┌──────────┐          ┌──────────────┐          ┌─────────────┐
│ Browser  │  poll    │  RC Proxy    │  poll    │  Datadog    │
│ (test    │─────────▶│  (localhost  │─────────▶│  RC Backend │
│  page)   │ /probes  │   :3030)     │ protobuf │             │
└──────────┘          └──────────────┘          └─────────────┘
     │                       │                         │
     │ service metadata      │ active clients         │
     │ (service, env, ver)   │ (protobuf Client msgs) │
     │                       │                         │
     ▼                       ▼                         ▼
 registers client        tracks clients          returns probes
 gets probes back        polls RC backend        for all clients
```

## Troubleshooting

### Proxy says "No active clients"
This is normal when no browsers are connected. Open the test page and it will start polling.

### Browser not receiving probes
1. Check browser console for errors
2. Verify `remoteConfigProxyUrl` is correct
3. Check proxy `/health` endpoint
4. Ensure probes are configured in Datadog for service `browser-test-app`

### Proxy returning 401 from Datadog
Check your `DD_API_KEY` in `.env` file is valid and has RC scope.

### Probes not firing
1. Verify probes are loaded (check "Current Probes" section)
2. Ensure probe targets match function names
3. Check browser console for Live Debugger errors

## Next Steps

### For Production Use

1. **Add Authentication**: Secure the proxy endpoints
2. **Restrict CORS**: Limit to specific origins
3. **Deploy with HTTPS**: Use a proper SSL certificate
4. **Monitor**: Add observability for proxy health
5. **Scale**: Consider multiple proxy instances

### Extend the POC

1. **Multiple Services**: Test with different service names
2. **Probe Types**: Test LOG_PROBE, METRIC_PROBE, SPAN_PROBE
3. **Conditions**: Test probes with when conditions
4. **Sampling**: Test probe sampling rates
5. **Error Handling**: Test with network failures

## Architecture Details

### RC Proxy Files
- `index.js` - Main Express server and endpoints
- `rc-client.js` - Datadog RC protocol client (protobuf)
- `client-tracker.js` - Active client tracking with TTL
- `config.js` - Environment configuration
- `remoteconfig.proto` - Protobuf schema

### Browser SDK Files
- `packages/live-debugger/src/entries/main.ts` - Init with RC config
- `packages/live-debugger/src/domain/remoteConfig.ts` - RC polling and sync
- `packages/live-debugger/src/domain/probes.ts` - Probe management

### Key Features
- ✅ Dynamic client tracking (30s TTL)
- ✅ Protobuf protocol compatibility
- ✅ Hardcoded to LIVE_DEBUGGING only
- ✅ Automatic probe synchronization
- ✅ Background polling (5s default)
- ✅ CORS enabled for localhost

## Support

For questions or issues:
1. Check the proxy logs for errors
2. Check browser console for SDK errors
3. Verify RC is enabled in your Datadog org
4. Ensure probes are configured correctly in Datadog

## License

Apache-2.0

