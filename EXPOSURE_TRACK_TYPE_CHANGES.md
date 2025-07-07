# Exposure Track Type Implementation

This document summarizes the changes made to add support for the new `exposure` track type in the Datadog browser SDK.

## Changes Made

### 1. Core Track Type Addition

**File**: `packages/core/src/domain/configuration/endpointBuilder.ts`

- Added `'exposure'` to the `TrackType` union type
- Added `batch_time` parameter for exposure events (similar to RUM events)
- Updated tests to include exposure endpoint validation

```typescript
export type TrackType = 'logs' | 'rum' | 'replay' | 'profile' | 'exposure'

// In buildEndpointParameters function:
if (trackType === 'exposure') {
  parameters.push(`batch_time=${timeStampNow()}`)
}
```

### 2. Transport Configuration Updates

**File**: `packages/core/src/domain/configuration/transportConfiguration.ts`

- Added `exposureEndpointBuilder` to `TransportConfiguration` interface
- Added `exposureEndpointBuilder` to `ReplicaConfiguration` interface
- Updated `computeEndpointBuilders` function to create exposure endpoint builder
- Updated `computeReplicaConfiguration` function to support exposure in replica mode

```typescript
export interface TransportConfiguration {
  logsEndpointBuilder: EndpointBuilder
  rumEndpointBuilder: EndpointBuilder
  sessionReplayEndpointBuilder: EndpointBuilder
  profilingEndpointBuilder: EndpointBuilder
  exposureEndpointBuilder: EndpointBuilder  // NEW
  replica?: ReplicaConfiguration
  site: Site
}

export interface ReplicaConfiguration {
  applicationId?: string
  logsEndpointBuilder: EndpointBuilder
  rumEndpointBuilder: EndpointBuilder
  exposureEndpointBuilder: EndpointBuilder  // NEW
}
```

### 3. Test Updates

**Files**: 
- `packages/core/src/domain/configuration/endpointBuilder.spec.ts`
- `packages/core/src/domain/configuration/transportConfiguration.spec.ts`

- Added tests for exposure endpoint batch_time parameter
- Added tests for exposure endpoint tag configuration
- Added tests for exposure endpoint URL detection in intake URL validation
- Added tests for exposure endpoint in replica configuration

## How the Exposure Track Type Works

### 1. Endpoint Building

The exposure track type follows the same pattern as other track types:

- **Endpoint Path**: `/api/v2/exposure`
- **Host Building**: Uses the same host building logic as other track types
- **Parameters**: Includes standard parameters plus `batch_time` for timing
- **Proxy Support**: Fully supports proxy configuration like other track types

### 2. Transport Layer Integration

The exposure track type integrates with the existing transport layer:

- **Batch Processing**: Uses `startBatchWithReplica` for efficient batching
- **Replica Support**: Supports replica endpoints for enterprise setups
- **Event Bridge**: Compatible with event bridge for mobile/webview scenarios
- **Error Handling**: Integrates with existing error reporting mechanisms

### 3. Configuration Integration

The exposure track type integrates with the existing configuration system:

- **Site Configuration**: Respects site and internal analytics subdomain settings
- **Tag Management**: Includes SDK version, API type, and custom tags
- **PCI Compliance**: Can use PCI-compliant intake endpoints
- **Proxy Configuration**: Supports both string and function-based proxy configuration

## Comparison with Existing Track Types

| Track Type | Endpoint | Batch Time | Special Features |
|------------|----------|------------|------------------|
| `logs` | `/api/v2/logs` | ❌ | PCI compliance support |
| `rum` | `/api/v2/rum` | ✅ | Session replay, profiling |
| `replay` | `/api/v2/replay` | ❌ | Session replay data |
| `profile` | `/api/v2/profile` | ❌ | Performance profiling |
| `exposure` | `/api/v2/exposure` | ✅ | Feature flag exposure tracking |

## Usage in a New Package

A new exposure package would use the exposure track type similar to how the logs package uses the logs track type:

### Configuration
```typescript
const configuration = {
  exposureEndpointBuilder: createEndpointBuilder(initConfiguration, 'exposure', tags),
  // ... other configuration
}
```

### Transport
```typescript
const batch = startBatchWithReplica(
  configuration,
  {
    endpoint: configuration.exposureEndpointBuilder,
    encoder: createIdentityEncoder(),
  },
  // ... replica configuration
)
```

### Event Assembly
```typescript
// Events are assembled and sent to the exposure endpoint
lifeCycle.subscribe(LifeCycleEventType.EXPOSURE_COLLECTED, (event) => {
  batch.add(event)
})
```

## Benefits of This Implementation

1. **Consistency**: Follows the same patterns as existing track types
2. **Flexibility**: Supports all existing configuration options (proxy, replica, etc.)
3. **Performance**: Includes batch_time for efficient batching like RUM events
4. **Compatibility**: Works with existing transport and configuration systems
5. **Extensibility**: Easy to add exposure-specific features in the future

## Testing

All changes have been tested and verified:

- ✅ Core endpoint builder tests pass
- ✅ Transport configuration tests pass
- ✅ Integration with existing systems works correctly
- ✅ Proxy and replica configurations work as expected

## Next Steps

To complete the exposure track type implementation, you would need to:

1. **Create the exposure package** following the structure outlined in `EXPOSURE_PACKAGE_EXAMPLE.md`
2. **Add exposure-specific event types** and validation
3. **Implement exposure collection logic** for feature flag tracking
4. **Add exposure telemetry** for monitoring and debugging
5. **Create exposure-specific tests** for the new package
6. **Update documentation** to include exposure track type usage

The core infrastructure is now in place to support the exposure track type, making it easy to build a complete exposure tracking package that follows the same patterns as the existing logs and RUM packages. 