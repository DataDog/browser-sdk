# Flagging SDK (Prerelease)

This package supports flagging and experimentation by performing evaluation in the browser.

## Initialize

```typescript
import { DatadogProvider } from '@datadog/openfeature-provider'
import { datadogRum } from '@datadog/browser-rum'

// Initialize Datadog Browser SDK
datadogRum.init({
  ...
  enableExperimentalFeatures: ["feature_flags"],
  ...
});

// Create the provider with RUM integration
const datadogFlaggingProvider = new DatadogProvider({
  applicationId: 'your-application-id',
  clientToken: 'your-client-token',
  rum: {
    sdk: datadogRum,
    ddFlaggingTracking: true, // Track feature flag evaluations in RUM
    ddExposureLogging: true,  // Log exposures in RUM
  }
})

// provide the subject
const subject = {
  targetingKey: 'subject-key-1',
}
await OpenFeature.setContext(subject)

// initialize
await OpenFeature.setProviderAndWait(datadogFlaggingProvider)
```

## Evaluation

```typescript
const client = OpenFeature.getClient()

// provide the flag key and a default value which is returned for exceptional conditions.
const flagEval = client.getBooleanValue('<FLAG_KEY>', false)
```

The RUM integration is handled through the `rum` option in the provider configuration. When provided, the provider will automatically:

1. Track feature flag evaluations in RUM when `ddFlaggingTracking` is enabled
2. Log exposures in RUM when `ddExposureLogging` is enabled

The integration uses a factory function pattern that provides a clean abstraction over the RUM SDK calls while maintaining the same functionality.

## Integration with RUM feature flag tracking

```typescript
// Initialize RUM with experimental feature flags tracking
import { datadogRum } from '@datadog/browser-rum';
import { createDatadogRumIntegration } from '@datadog/openfeature-provider';

// Initialize Datadog Browser SDK
datadogRum.init({
  ...
  enableExperimentalFeatures: ["feature_flags"],
  ...
});

// Create the RUM integration
const rumIntegration = createDatadogRumIntegration();

// Add OpenFeature hook
OpenFeature.addHooks({
  after(_hookContext: HookContext, details: EvaluationDetails<FlagValue>) {
    rumIntegration.trackFeatureFlag(details.flagKey, details.value)
  }
})
```

The RUM integration is handled through a factory function that returns an object conforming to the `RumIntegration` interface. This provides better abstraction and testability while maintaining a simple functional approach.
