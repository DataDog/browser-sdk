# Agent Mode Configuration

## Overview

The RC proxy supports two modes:

1. **Agent Mode** (recommended for POC): Polls your local Datadog agent
   - ✅ No CORS issues
   - ✅ No RC backend access needed
   - ✅ Works exactly like tracer libraries
   - ✅ Uses the same API key already configured in your Docker agent

2. **Backend Mode**: Polls Datadog RC backend directly
   - ❌ Currently broken

## Quick Start with Agent Mode

### 1. Update your .env file

```bash
# RC Proxy Configuration - Agent Mode
AGENT_URL=http://localhost:8126

# Optional
PORT=3030
POLL_INTERVAL=5000
CLIENT_TTL=30000
```

### 2. Make sure your Docker agent is running

```bash
docker ps | grep datadog/agent
```

### 3. Start the proxy

```bash
npm start
```

### 4. The proxy will now:

- Poll your local agent at `http://localhost:8126/v0.7/config`
- Get the same LIVE_DEBUGGING probes your backend services see
- Serve them to the browser SDK (with CORS headers)

### 5. Browser SDK configuration stays the same

In `sandbox/debugger.js`:

```javascript
window.DD_LIVE_DEBUGGER.init({
  service: 'my-service',
  env: 'production',
  version: '1.0.0',
  remoteConfigProxyUrl: 'http://localhost:3030',
  remoteConfigPollInterval: 5000,
})
```

## How It Works

```
Browser SDK --[HTTP/JSON]--> RC Proxy --[HTTP/JSON]--> Local Agent --[HTTP/Protobuf]--> Datadog RC Backend
            (CORS OK)                    (No CORS)                     (With API Key)
```

The proxy acts as a CORS-enabled bridge between the browser and your local agent.

## Switching Back to Backend Mode

When RC backend access is resolved, update `.env`:

```bash
# Backend Mode
DD_API_KEY=your_api_key_here
DD_SITE=datadoghq.com

# Comment out or remove
# AGENT_URL=http://localhost:8126
```

The proxy will automatically detect the mode based on which variables are set.
